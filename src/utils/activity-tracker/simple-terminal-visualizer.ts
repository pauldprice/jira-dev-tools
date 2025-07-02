import { ActivityItem } from './types';
import { DateTime } from 'luxon';
import chalk from 'chalk';

export class SimpleTerminalVisualizer {
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

    const lines: string[] = [];
    lines.push(chalk.bold(`\nActivity Timeline for ${date.toFormat('EEEE, MMMM d, yyyy')}:`));
    lines.push('');

    // Simple timeline with one line per activity
    sorted.forEach(activity => {
      const startTime = activity.startTime.toFormat('HH:mm');
      const endTime = activity.endTime.toFormat('HH:mm');
      const duration = Math.round(activity.endTime.diff(activity.startTime, 'minutes').minutes);
      
      // Create a simple bar based on duration
      const barLength = Math.min(Math.floor(duration / 5), 40); // 5 min = 1 char, max 40 chars
      const bar = '█'.repeat(barLength);
      
      const color = this.colors[activity.type] || chalk.white;
      
      // Format the line
      let line = `${startTime} - ${endTime} `;
      line += color(bar);
      line += ' ';
      
      // Add title
      const title = this.shortenTitle(activity.title);
      line += chalk.bold(title);
      
      // Add duration
      line += chalk.dim(` (${duration} min)`);
      
      // Add participants/channel for non-dark periods
      if (activity.type !== 'dark_period') {
        const info = activity.channel || 
                    (activity.participants.length > 0 ? 
                     activity.participants.slice(0, 2).join(', ') + 
                     (activity.participants.length > 2 ? '...' : '') : '');
        if (info) {
          line += chalk.dim(` - ${info}`);
        }
      }
      
      lines.push(line);
    });

    // Add summary
    lines.push('');
    lines.push(this.buildSummary(activities));

    return lines.join('\n');
  }

  private shortenTitle(title: string): string {
    return title
      .replace('Direct message with ', 'DM: ')
      .replace('Discussion in ', '')
      .replace('Meeting: ', '')
      .replace('Forwarded: ', 'Fwd: ')
      .replace('Received: ', '')
      .replace('Sent: ', '')
      .replace('Deep work session', 'Deep work')
      .replace('Morning routine', 'Morning prep')
      .replace('Lunch break', 'Lunch');
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
    
    summary.push(chalk.bold('Summary by Type:'));
    
    // Sort by duration
    const sortedTotals = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    
    sortedTotals.forEach(([type, minutes]) => {
      const percentage = (minutes / totalMinutes * 100).toFixed(1);
      const hours = (minutes / 60).toFixed(1);
      const color = this.colors[type] || chalk.white;
      
      // Create a mini bar chart
      const barLength = Math.floor(parseFloat(percentage) / 2.5); // 40 chars max
      const bar = '▇'.repeat(barLength);
      
      summary.push(
        color(`${type.padEnd(12)} ${bar} ${percentage}% (${hours} hrs)`)
      );
    });
    
    return summary.join('\n');
  }
}