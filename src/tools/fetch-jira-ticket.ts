#!/usr/bin/env node
import { Command } from 'commander';
import { logger, config, progress, createJiraClient, FileSystem } from '../utils';
import { JiraFormatter } from '../utils/jira-formatter';

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: any;
    status?: {
      name: string;
    };
    created: string;
    updated: string;
    reporter?: any;
    assignee?: any;
    priority?: {
      name: string;
    };
    labels?: string[];
    attachment?: Array<{
      id: string;
      filename: string;
      created: string;
      size: number;
      mimeType: string;
      content: string;
      author: any;
    }>;
  };
  renderedFields?: {
    description?: string;
  };
  changelog?: {
    histories: Array<{
      id: string;
      author: any;
      created: string;
      items: Array<{
        field: string;
        fieldtype: string;
        from: string;
        fromString: string;
        to: string;
        toString: string;
      }>;
    }>;
  };
}

interface JiraComment {
  id: string;
  author: any;
  body: any;
  created: string;
  updated: string;
}

interface JiraCommentsResponse {
  comments: JiraComment[];
}

interface TimelineEntry {
  timestamp: string;
  type: 'created' | 'comment' | 'change' | 'attachment';
  author: string;
  content: string;
  metadata?: Record<string, any>;
}

interface LLMFriendlyOutput {
  ticketId: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  created: string;
  updated: string;
  reporter: string;
  assignee: string;
  
  // Main content in markdown
  description: string;
  
  // All attachments
  attachments: Array<{
    filename: string;
    url: string;
    uploadedBy: string;
    uploadedAt: string;
    size: string;
  }>;
  
  // Chronological timeline of all activity
  timeline: TimelineEntry[];
  
  // Summary for LLM consumption
  summary: string;
}

const program = new Command();

program
  .name('fetch-jira-ticket')
  .description('Fetch Jira ticket details and output as JSON')
  .argument('<ticket-id>', 'Jira ticket ID (e.g., APP-1234)')
  .option('--no-comments', 'exclude comments from output')
  .option('--no-history', 'exclude change history from output')
  .option('--format <type>', 'output format: llm (default) or raw', 'llm')
  .option('-o, --output <file>', 'save output to file instead of stdout')
  .action(async (ticketId: string, options) => {
    try {
      // Validate Jira configuration
      const jiraConfig = config.getJiraConfig();
      if (!jiraConfig) {
        logger.error('Missing Jira configuration. Please set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
        process.exit(1);
      }

      progress.start(`Fetching ticket ${ticketId}...`);

      // Create Jira client
      const client = createJiraClient(
        jiraConfig.JIRA_BASE_URL,
        jiraConfig.JIRA_EMAIL,
        jiraConfig.JIRA_API_TOKEN
      );

      logger.debug(`Connecting to Jira at ${jiraConfig.JIRA_BASE_URL}`);

      // Determine what to expand based on options
      const expandFields = ['renderedFields'];
      if (!options.noHistory) {
        expandFields.push('changelog');
      }
      
      // Fetch issue details with all requested expansions
      progress.update(`Fetching ticket details...`);
      const issue = await client.get<JiraIssue>(
        `/rest/api/3/issue/${ticketId}?expand=${expandFields.join(',')}`
      );

      let comments: JiraComment[] = [];
      
      // Fetch comments if not disabled
      if (!options.noComments) {
        progress.update(`Fetching comments for ${ticketId}...`);
        
        const commentsResponse = await client.get<JiraCommentsResponse>(
          `/rest/api/3/issue/${ticketId}/comment`
        );
        comments = commentsResponse.comments;
      }

      progress.succeed(`Fetched ticket ${ticketId}`);

      // Format based on requested format
      let output: string;
      if (options.format === 'raw') {
        // Raw format - return original Jira response structure
        const result = {
          issue,
          comments: options.noComments ? undefined : comments,
        };
        output = JSON.stringify(result, null, 2);
      } else {
        // LLM-friendly format
        const llmOutput = formatForLLM(issue, comments, jiraConfig.JIRA_BASE_URL);
        output = JSON.stringify(llmOutput, null, 2);
      }

      // Output result
      if (options.output) {
        await FileSystem.writeFile(options.output, output);
        logger.success(`Saved to ${options.output}`);
      } else {
        console.log(output);
      }

    } catch (error: any) {
      progress.fail();
      
      if (error.response?.status === 404) {
        logger.error(`Ticket ${ticketId} not found`);
      } else if (error.response?.status === 401) {
        logger.error('Authentication failed. Please check your Jira credentials');
      } else {
        logger.error(`Failed to fetch ticket: ${error.message || error}`);
      }
      
      process.exit(1);
    }
  });

// Format ticket data for LLM consumption
function formatForLLM(issue: JiraIssue, comments: JiraComment[], baseUrl: string): LLMFriendlyOutput {
  const timeline: TimelineEntry[] = [];
  
  // Add ticket creation to timeline
  timeline.push({
    timestamp: issue.fields.created,
    type: 'created',
    author: JiraFormatter.formatUser(issue.fields.reporter),
    content: `Ticket created: ${issue.fields.summary}`,
    metadata: {
      status: issue.fields.status?.name,
      priority: issue.fields.priority?.name,
    }
  });
  
  // Add description as initial content if present
  if (issue.fields.description) {
    const descriptionMd = JiraFormatter.documentToMarkdown(issue.fields.description);
    if (descriptionMd.trim()) {
      timeline.push({
        timestamp: issue.fields.created,
        type: 'comment',
        author: JiraFormatter.formatUser(issue.fields.reporter),
        content: `Initial description:\n\n${descriptionMd}`,
      });
    }
  }
  
  // Add attachments to timeline
  if (issue.fields.attachment) {
    issue.fields.attachment.forEach(att => {
      timeline.push({
        timestamp: att.created,
        type: 'attachment',
        author: JiraFormatter.formatUser(att.author),
        content: `Attached file: ${att.filename} (${formatFileSize(att.size)})`,
        metadata: {
          filename: att.filename,
          mimeType: att.mimeType,
          size: att.size,
        }
      });
    });
  }
  
  // Add history/changelog entries
  if (issue.changelog?.histories) {
    issue.changelog.histories.forEach(history => {
      const changes = history.items.map(item => {
        const from = JiraFormatter.formatFieldValue(item.field, item.fromString || item.from);
        const to = JiraFormatter.formatFieldValue(item.field, item.toString || item.to);
        return `- ${item.field}: ${from} → ${to}`;
      }).join('\n');
      
      timeline.push({
        timestamp: history.created,
        type: 'change',
        author: JiraFormatter.formatUser(history.author),
        content: `Made changes:\n${changes}`,
      });
    });
  }
  
  // Add comments to timeline
  comments.forEach(comment => {
    const commentMd = JiraFormatter.documentToMarkdown(comment.body);
    timeline.push({
      timestamp: comment.created,
      type: 'comment',
      author: JiraFormatter.formatUser(comment.author),
      content: commentMd,
    });
  });
  
  // Filter out change entries - we only want the current state
  const filteredTimeline = timeline.filter(entry => entry.type !== 'change');
  
  // Sort timeline chronologically
  filteredTimeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Format attachments
  const attachments = (issue.fields.attachment || []).map(att => ({
    filename: att.filename,
    url: `${baseUrl}/secure/attachment/${att.id}/${att.filename}`,
    uploadedBy: JiraFormatter.formatUser(att.author),
    uploadedAt: JiraFormatter.formatDate(att.created),
    size: formatFileSize(att.size),
  }));
  
  // Generate summary
  const summary = generateSummary(issue, filteredTimeline, attachments);
  
  return {
    ticketId: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    priority: issue.fields.priority?.name || 'None',
    labels: issue.fields.labels || [],
    created: JiraFormatter.formatDate(issue.fields.created),
    updated: JiraFormatter.formatDate(issue.fields.updated),
    reporter: JiraFormatter.formatUser(issue.fields.reporter),
    assignee: JiraFormatter.formatUser(issue.fields.assignee),
    description: JiraFormatter.documentToMarkdown(issue.fields.description),
    attachments,
    timeline: filteredTimeline,
    summary,
  };
}

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function generateSummary(issue: JiraIssue, timeline: TimelineEntry[], attachments: any[]): string {
  const parts: string[] = [];
  
  // Basic info
  parts.push(`# Jira Ticket ${issue.key}: ${issue.fields.summary}`);
  parts.push('');
  parts.push(`**Status**: ${issue.fields.status?.name || 'Unknown'}`);
  parts.push(`**Priority**: ${issue.fields.priority?.name || 'None'}`);
  parts.push(`**Reporter**: ${JiraFormatter.formatUser(issue.fields.reporter)}`);
  parts.push(`**Assignee**: ${JiraFormatter.formatUser(issue.fields.assignee)}`);
  
  if (issue.fields.labels && issue.fields.labels.length > 0) {
    parts.push(`**Labels**: ${issue.fields.labels.join(', ')}`);
  }
  
  parts.push('');
  
  // Timeline summary
  const commentCount = timeline.filter(t => t.type === 'comment').length;
  
  parts.push('## Activity Summary');
  parts.push(`- ${commentCount} comments`);
  parts.push(`- ${attachments.length} attachments`);
  
  // Latest activity
  if (timeline.length > 0) {
    const latest = timeline[timeline.length - 1];
    parts.push('');
    parts.push(`**Latest activity**: ${JiraFormatter.formatDate(latest.timestamp)} by ${latest.author}`);
  }
  
  return parts.join('\n');
}

program.parse();