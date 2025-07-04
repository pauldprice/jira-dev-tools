import { SimpleGit } from 'simple-git';
import { ReleaseNotesConfig } from '../types';
import { logger } from '../../../utils/enhanced-logger';

export async function stepFetchTicketDetails(_git: SimpleGit, _config: ReleaseNotesConfig): Promise<void> {
  logger.info('stepFetchTicketDetails step is not yet implemented');
}