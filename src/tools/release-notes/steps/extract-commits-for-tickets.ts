import { SimpleGit } from 'simple-git';
import { ReleaseNotesConfig } from '../types';
import { logger } from '../../../utils/enhanced-logger';

export async function stepExtractCommitsForTickets(_git: SimpleGit, _config: ReleaseNotesConfig): Promise<void> {
  logger.info('stepExtractCommitsForTickets step is not yet implemented');
}