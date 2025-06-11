import ora, { Ora } from 'ora';
import { logger } from './logger';

export class Progress {
  private spinner: Ora | null = null;

  start(message: string): void {
    if (process.stdout.isTTY && !process.env.CI) {
      this.spinner = ora({
        text: message,
        color: 'yellow',
        spinner: 'dots',
      }).start();
    } else {
      logger.info(message);
    }
  }

  update(message: string): void {
    if (this.spinner) {
      this.spinner.text = message;
    } else {
      logger.info(message);
    }
  }

  succeed(message?: string): void {
    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    } else if (message) {
      logger.success(message);
    }
  }

  fail(message?: string): void {
    if (this.spinner) {
      this.spinner.fail(message);
      this.spinner = null;
    } else if (message) {
      logger.error(message);
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  info(message: string): void {
    if (this.spinner) {
      this.spinner.info(message);
      this.spinner = null;
    } else {
      logger.info(message);
    }
  }

  warn(message: string): void {
    if (this.spinner) {
      this.spinner.warn(message);
      this.spinner = null;
    } else {
      logger.warn(message);
    }
  }
}

export const progress = new Progress();