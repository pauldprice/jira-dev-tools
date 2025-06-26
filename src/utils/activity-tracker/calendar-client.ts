import { google, calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import { ActivityItem } from './types';
import { GoogleAuthManager } from './google-auth';
import { logger } from '../enhanced-logger';
import { CacheManager } from '../cache-manager';

export class CalendarActivityClient {
  private calendar?: calendar_v3.Calendar;
  private authManager: GoogleAuthManager;
  private userEmail?: string;
  private cacheManager: CacheManager;

  constructor(authManager: GoogleAuthManager) {
    this.authManager = authManager;
    this.cacheManager = new CacheManager();
  }

  async initialize(): Promise<void> {
    const auth = await this.authManager.authenticate();
    this.calendar = google.calendar({ version: 'v3', auth });
    
    // Get user's primary calendar
    const calendarList = await this.calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items?.find(cal => cal.primary);
    this.userEmail = primaryCalendar?.id || 'primary';
    logger.debug(`Calendar authenticated for: ${this.userEmail}`);
  }

  async fetchDayActivity(date: DateTime): Promise<ActivityItem[]> {
    if (!this.calendar) throw new Error('Calendar client not initialized');

    const startOfDay = date.startOf('day');
    const endOfDay = date.endOf('day');
    
    const cacheKey = `calendar-activity:${date.toISODate()}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      logger.debug('Using cached Calendar activity');
      // Restore DateTime objects from cached data
      return (cached as any[]).map(item => ({
        ...item,
        startTime: DateTime.fromISO(item.startTime),
        endTime: DateTime.fromISO(item.endTime)
      }));
    }

    const activities: ActivityItem[] = [];

    try {
      const events = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISO(),
        timeMax: endOfDay.toISO(),
        singleEvents: true,
        orderBy: 'startTime'
      } as any);

      const response = events as any;
      if (response.data && response.data.items) {
        for (const event of response.data.items) {
          const activity = this.processCalendarEvent(event);
          if (activity) {
            activities.push(activity);
          }
        }
      }

      await this.cacheManager.set(cacheKey, activities);
      return activities;
    } catch (error) {
      logger.error(`Failed to fetch Calendar activity: ${error}`);
      return [];
    }
  }

  private processCalendarEvent(event: calendar_v3.Schema$Event): ActivityItem | null {
    if (!event.start || !event.summary) return null;

    // Skip all-day events or events without specific times
    if (event.start.date && !event.start.dateTime) return null;

    const startTime = DateTime.fromISO(event.start.dateTime!);
    const endTime = event.end?.dateTime ? DateTime.fromISO(event.end.dateTime) : startTime.plus({ hours: 1 });

    // Get attendees
    const attendees = event.attendees
      ?.filter(a => a.email && a.email !== this.userEmail && !a.resource)
      .map(a => a.email!)
      || [];

    // Build description
    let description = event.description || '';
    if (event.location) {
      description = `Location: ${event.location}\n\n${description}`;
    }
    if (event.conferenceData?.entryPoints) {
      const videoLink = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
      if (videoLink?.uri) {
        description = `Video: ${videoLink.uri}\n\n${description}`;
      }
    }

    return {
      startTime,
      endTime,
      participants: attendees,
      title: `Meeting: ${event.summary}`,
      summary: description.substring(0, 200) || 'No description',
      type: 'calendar',
      rawContent: description
    };
  }
}