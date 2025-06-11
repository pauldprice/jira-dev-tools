import chalk from 'chalk';

export class Logger {
  private static instance: Logger;
  private useColor: boolean = true;

  private constructor() {
    // Check if we should disable colors
    if (
      !process.stdout.isTTY ||
      process.env.NO_COLOR ||
      process.env.TERM === 'dumb' ||
      process.env.CI ||
      process.env.CONTINUOUS_INTEGRATION ||
      process.env.GITHUB_ACTIONS
    ) {
      this.useColor = false;
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private colorize(color: keyof typeof chalk, text: string): string {
    if (!this.useColor) return text;
    return (chalk[color] as any)(text);
  }

  info(message: string): void {
    console.log(this.colorize('cyan', message));
  }

  success(message: string): void {
    console.log(this.colorize('green', `✓ ${message}`));
  }

  error(message: string): void {
    console.error(this.colorize('red', `✗ ${message}`));
  }

  warn(message: string): void {
    console.warn(this.colorize('yellow', message));
  }

  debug(message: string): void {
    if (process.env.VERBOSE === 'true') {
      console.log(this.colorize('gray', `[DEBUG] ${message}`));
    }
  }

  bold(text: string): string {
    return this.useColor ? chalk.bold(text) : text;
  }

  header(text: string): void {
    console.log(this.colorize('blue', this.bold(`=== ${text} ===`)));
  }

  section(title: string, content: string): void {
    console.log(this.colorize('magenta', this.bold(title)));
    console.log(content);
  }
}

export const logger = Logger.getInstance();