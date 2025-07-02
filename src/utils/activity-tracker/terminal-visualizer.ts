import { ActivityItem } from './types';
import { DateTime } from 'luxon';
import chalk from 'chalk';

export class TerminalVisualizer {
  private readonly hourWidth = 10; // characters per hour
  private readonly colors: Record<string, chalk.Chalk> = {
    calendar: chalk.blue,
    email: chalk.green,
    slack: chalk.yellow,
    dark_period: chalk.gray
  };

  visualizeDay(activities: ActivityItem[], date: DateTime): string {
    if (activities.length === 0) {
      return 'No activities found for this day.';
    }

    // Sort activities by start time
    const sorted = [...activities].sort((a, b) => a.startTime.toMillis() - b.startTime.toMillis());

    // Find the time bounds
    const dayStart = date.startOf('day').set({ hour: 8 }); // Default 8 AM
    const dayEnd = date.startOf('day').set({ hour: 18 }); // Default 6 PM
    
    const firstActivity = sorted[0].startTime;
    const lastActivity = sorted[sorted.length - 1].endTime;
    
    const timelineStart = DateTime.min(dayStart, firstActivity).startOf('hour');
    const timelineEnd = DateTime.max(dayEnd, lastActivity).endOf('hour');
    

    // Build the timeline
    const lines: string[] = [];
    
    // Header with hours
    lines.push(this.buildTimeHeader(timelineStart, timelineEnd));
    lines.push(''); // Empty line

    // Group overlapping activities
    const activityGroups = this.groupOverlappingActivities(sorted);

    // Render each group
    activityGroups.forEach((group, groupIndex) => {
      group.forEach(activity => {
        const line = this.renderActivity(activity, timelineStart);
        lines.push(line);
      });
      
      // Add spacing between groups
      if (groupIndex < activityGroups.length - 1) {
        lines.push('');
      }
    });

    // Add summary statistics
    lines.push('');
    lines.push(this.buildSummary(activities));

    return lines.join('\n');
  }

  private buildTimeHeader(start: DateTime, end: DateTime): string {
    const hours = Math.ceil(end.diff(start, 'hours').hours);
    let header = '';
    
    for (let i = 0; i <= hours; i++) {
      const time = start.plus({ hours: i });
      const label = time.toFormat('HH:mm');
      const padding = this.hourWidth - label.length;
      
      header += label;
      if (i < hours) {
        header += ' '.repeat(Math.max(1, padding));
      }
    }
    
    return chalk.bold(header);
  }

  private renderActivity(activity: ActivityItem, timelineStart: DateTime): string {
    const startOffset = Math.floor(activity.startTime.diff(timelineStart, 'minutes').minutes / 60 * this.hourWidth);
    const duration = activity.endTime.diff(activity.startTime, 'minutes').minutes;
    const width = Math.max(3, Math.floor(duration / 60 * this.hourWidth));
    
    // Build the timeline bar
    let line = ' '.repeat(Math.max(0, startOffset));
    
    // Determine bar style based on type
    const color = this.colors[activity.type] || chalk.white;
    const barChar = activity.type === 'dark_period' ? '═' : '─';
    const startChar = activity.type === 'dark_period' ? '╞' : '├';
    const endChar = activity.type === 'dark_period' ? '╡' : '┤';
    
    // Build the bar
    let bar = startChar + barChar.repeat(Math.max(1, width - 2)) + endChar;
    
    // Add label if there's enough space
    const minLabelWidth = 15;
    if (width >= minLabelWidth) {
      const label = this.truncateLabel(activity.title, width - 6);
      if (label) {
        const labelWithBrackets = `[ ${label} ]`;
        const labelStart = Math.floor((width - labelWithBrackets.length) / 2);
        if (labelStart > 0 && labelStart + labelWithBrackets.length < bar.length) {
          bar = bar.substring(0, labelStart) + 
                labelWithBrackets + 
                bar.substring(labelStart + labelWithBrackets.length);
        }
      }
    }
    
    line += color(bar);
    
    // Add time labels at the ends
    const startTime = activity.startTime.toFormat('HH:mm');
    const endTime = activity.endTime.toFormat('HH:mm');
    
    // Place start time before the bar if there's room
    if (startOffset >= 6) {
      line = line.substring(0, startOffset - 6) + chalk.dim(startTime) + ' ' + line.substring(startOffset);
    }
    
    // Add end time after the bar
    line += ' ' + chalk.dim(endTime);
    
    // Add additional info
    if (activity.type !== 'dark_period') {
      const info = activity.channel || 
                  (activity.participants.length > 0 ? `${activity.participants.length} people` : '');
      if (info) {
        line += chalk.dim(` (${info})`);
      }
    }
    
    return line;
  }

  private groupOverlappingActivities(activities: ActivityItem[]): ActivityItem[][] {
    const groups: ActivityItem[][] = [];
    let currentGroup: ActivityItem[] = [];
    
    activities.forEach(activity => {
      if (currentGroup.length === 0) {
        currentGroup.push(activity);
      } else {
        // Check if this activity overlaps with any in the current group
        const overlaps = currentGroup.some(a => 
          activity.startTime < a.endTime && activity.endTime > a.startTime
        );
        
        if (overlaps) {
          currentGroup.push(activity);
        } else {
          groups.push(currentGroup);
          currentGroup = [activity];
        }
      }
    });
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  private truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    
    // Try to shorten common patterns first
    let shortened = label
      .replace('Direct message with ', 'DM: ')
      .replace('Discussion in ', '')
      .replace('Meeting: ', '')
      .replace('Forwarded: ', 'Fwd: ')
      .replace('Received: ', 'Re: ')
      .replace('Sent: ', '');
    
    if (shortened.length <= maxLength) return shortened;
    return shortened.substring(0, maxLength - 3) + '...';
  }

  private buildSummary(activities: ActivityItem[]): string {
    const summary: string[] = [];
    
    // Calculate totals by type
    const totals = new Map<string, number>();
    let totalMinutes = 0;
    
    activities.forEach(activity => {
      const duration = activity.endTime.diff(activity.startTime, 'minutes').minutes;
      totals.set(activity.type, (totals.get(activity.type) || 0) + duration);
      totalMinutes += duration;
    });
    
    summary.push(chalk.bold('\nSummary:'));
    summary.push(`Total tracked time: ${Math.round(totalMinutes)} minutes (${(totalMinutes / 60).toFixed(1)} hours)`);
    
    // Sort by duration
    const sortedTotals = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedTotals.forEach(([type, minutes]) => {
      const percentage = (minutes / totalMinutes * 100).toFixed(1);
      const hours = (minutes / 60).toFixed(1);
      const color = this.colors[type] || chalk.white;
      
      summary.push(color(`  ${type}: ${Math.round(minutes)} min (${hours} hrs, ${percentage}%)`));
    });
    
    return summary.join('\n');
  }
}