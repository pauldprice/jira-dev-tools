import { DateTime } from 'luxon';
import { ActivityItem, ActivityTrackerConfig } from './types';
import { createCachedClaudeClient } from '../cached-claude';
import { logger } from '../enhanced-logger';

export class ActivityProcessor {
  private config: ActivityTrackerConfig;
  private claudeClient: any;

  constructor(config: ActivityTrackerConfig) {
    this.config = {
      darkPeriodThreshold: 30,
      workdayStart: '08:00',
      workdayEnd: '18:00',
      timezone: DateTime.local().zoneName,
      ...config
    };
    
    this.claudeClient = createCachedClaudeClient(process.env.ANTHROPIC_API_KEY);
  }

  async processActivities(activities: ActivityItem[]): Promise<ActivityItem[]> {
    // Sort activities by start time
    const sorted = [...activities].sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());
    
    // Process each activity with LLM for better summaries
    const processed: ActivityItem[] = [];
    
    for (const activity of sorted) {
      if (activity.rawContent && activity.type !== 'dark_period') {
        const enhanced = await this.enhanceActivityWithLLM(activity);
        processed.push(enhanced);
      } else {
        processed.push(activity);
      }
    }
    
    // Add dark periods
    const withDarkPeriods = this.addDarkPeriods(processed);
    
    return withDarkPeriods;
  }

  private async enhanceActivityWithLLM(activity: ActivityItem): Promise<ActivityItem> {
    if (!this.claudeClient) return activity;

    try {
      const prompt = this.buildSummarizationPrompt(activity);
      
      const response = await this.claudeClient.generateText({
        prompt,
        maxTokens: 200,
        model: 'claude-3-haiku-20240307'
      });

      const summary = response.text.trim();
      
      // Try to extract a better title if the LLM provided one
      const titleMatch = summary.match(/^Title: (.+)$/m);
      const summaryMatch = summary.match(/^Summary: (.+)$/m);
      
      return {
        ...activity,
        title: titleMatch ? titleMatch[1] : activity.title,
        summary: summaryMatch ? summaryMatch[1] : summary
      };
    } catch (error) {
      logger.debug('Failed to enhance activity with LLM:', error);
      return activity;
    }
  }

  private buildSummarizationPrompt(activity: ActivityItem): string {
    const contextInfo: Record<string, string> = {
      slack: 'Slack conversation',
      email: 'Email exchange',
      calendar: 'Calendar meeting',
      dark_period: 'Dark period'
    };

    return `Summarize this ${contextInfo[activity.type] || activity.type} into a concise title and summary.

Context:
- Type: ${activity.type}
- Participants: ${activity.participants.join(', ')}
${activity.channel ? `- Channel: ${activity.channel}` : ''}
- Original Title: ${activity.title}

Content:
${activity.rawContent?.substring(0, 1000)}

Provide a response in this format:
Title: [A clear, concise title describing the main topic/action]
Summary: [A 1-2 sentence summary of what was discussed or done]

Focus on:
- What was the main topic or decision?
- What action was taken or needs to be taken?
- Any important outcomes or next steps?`;
  }

  private addDarkPeriods(activities: ActivityItem[]): ActivityItem[] {
    const result: ActivityItem[] = [];
    const threshold = this.config.darkPeriodThreshold || 30;
    
    // Get workday bounds
    const workdayStart = this.parseTime(this.config.workdayStart || '08:00');
    const workdayEnd = this.parseTime(this.config.workdayEnd || '18:00');
    
    if (activities.length === 0) return result;
    
    // Add dark period at start of day if needed
    const firstActivity = activities[0];
    if (firstActivity.startTime.hour >= workdayStart.hour) {
      const dayStart = firstActivity.startTime.set({ 
        hour: workdayStart.hour, 
        minute: workdayStart.minute,
        second: 0,
        millisecond: 0
      });
      
      const gap = firstActivity.startTime.diff(dayStart, 'minutes').minutes;
      if (gap >= threshold) {
        result.push(this.createDarkPeriod(dayStart, firstActivity.startTime));
      }
    }
    
    // Process activities and gaps
    for (let i = 0; i < activities.length; i++) {
      result.push(activities[i]);
      
      if (i < activities.length - 1) {
        const current = activities[i];
        const next = activities[i + 1];
        
        const gap = next.startTime.diff(current.endTime, 'minutes').minutes;
        if (gap >= threshold) {
          result.push(this.createDarkPeriod(current.endTime, next.startTime));
        }
      }
    }
    
    // Add dark period at end of day if needed
    const lastActivity = activities[activities.length - 1];
    if (lastActivity.endTime.hour <= workdayEnd.hour) {
      const dayEnd = lastActivity.endTime.set({ 
        hour: workdayEnd.hour, 
        minute: workdayEnd.minute,
        second: 0,
        millisecond: 0
      });
      
      const gap = dayEnd.diff(lastActivity.endTime, 'minutes').minutes;
      if (gap >= threshold) {
        result.push(this.createDarkPeriod(lastActivity.endTime, dayEnd));
      }
    }
    
    return result;
  }

  private createDarkPeriod(start: DateTime, end: DateTime): ActivityItem {
    const duration = Math.round(end.diff(start, 'minutes').minutes);
    
    let title = 'Focus time';
    let summary = 'No tracked interactions';
    
    // Guess the type of dark period based on time and duration
    if (duration >= 45 && duration <= 75) {
      title = 'Lunch break';
      summary = 'Likely lunch or personal break';
    } else if (duration >= 90) {
      title = 'Deep work session';
      summary = 'Extended focus time without interruptions';
    } else if (start.hour < 9) {
      title = 'Morning routine';
      summary = 'Start of day preparation';
    }
    
    return {
      startTime: start,
      endTime: end,
      participants: [],
      title,
      summary,
      type: 'dark_period'
    };
  }

  private parseTime(timeStr: string): { hour: number; minute: number } {
    const [hour, minute] = timeStr.split(':').map(Number);
    return { hour, minute };
  }

  formatToCSV(activities: ActivityItem[]): string[][] {
    const headers = [
      'Start Time',
      'End Time',
      'Duration (min)',
      'Participants/Channels',
      'Title',
      'Summary',
      'Type'
    ];

    const rows = activities.map(activity => {
      const duration = Math.round(activity.endTime.diff(activity.startTime, 'minutes').minutes);
      const participants = activity.channel 
        ? activity.channel 
        : activity.participants.join('; ');

      return [
        activity.startTime.toFormat('HH:mm'),
        activity.endTime.toFormat('HH:mm'),
        duration.toString(),
        participants || '-',
        activity.title,
        activity.summary,
        activity.type
      ];
    });

    return [headers, ...rows];
  }
}