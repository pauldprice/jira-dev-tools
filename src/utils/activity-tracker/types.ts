import { DateTime } from 'luxon';

export interface ActivityItem {
  startTime: DateTime;
  endTime: DateTime;
  participants: string[];
  channel?: string;
  title: string;
  summary: string;
  type: 'slack' | 'email' | 'calendar' | 'dark_period';
  rawContent?: string;
}

export interface SlackMessage {
  user: string;
  text: string;
  timestamp: string;
  channel: string;
  thread_ts?: string;
}

export interface EmailActivity {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body?: string;
  timestamp: string;
  threadId: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: DateTime;
  end: DateTime;
  attendees: string[];
  location?: string;
}

export interface DarkPeriod {
  startTime: DateTime;
  endTime: DateTime;
  duration: number; // minutes
}

export interface ActivityTrackerConfig {
  slackToken?: string;
  googleCredentialsPath?: string;
  googleTokenPath?: string;
  darkPeriodThreshold?: number; // minutes, default 30
  workdayStart?: string; // HH:mm format, default "08:00"
  workdayEnd?: string; // HH:mm format, default "18:00"
  timezone?: string; // default to system timezone
}