export interface ReleaseNotesConfig {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;
  workDir: string;
  outputFile: string;
  keepFiles: boolean;
  verbose: boolean;
  jiraProject?: string;
  fetchJiraDetails: boolean;
  useAI: boolean;
  aiModel?: string;
  generatePDF: boolean;
  pdfFile?: string;
  debugLimit?: number;
  releaseVersion?: string;
  fixVersion?: string;
  mode?: 'branch' | 'version';
  includePrDescriptions?: boolean;
}

export interface StepFunction {
  (git: any, config: ReleaseNotesConfig): Promise<void>;
}