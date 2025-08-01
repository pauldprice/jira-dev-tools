import { HttpClient } from './http-client';
import { JiraFormatter } from './jira-formatter';
import { logger } from './logger';

// Types
export interface JiraCredentials {
  JIRA_BASE_URL: string;
  JIRA_EMAIL: string;
  JIRA_API_TOKEN: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: any;
    created: string;
    updated: string;
    status?: {
      name: string;
    };
    issuetype?: {
      name: string;
      description?: string;
    };
    priority?: {
      name: string;
    };
    reporter?: any;
    assignee?: any;
    attachment?: JiraAttachment[];
    labels?: string[];
    fixVersions?: Array<{
      self: string;
      id: string;
      name: string;
      archived: boolean;
      released: boolean;
    }>;
  };
  changelog?: {
    histories: any[];
  };
}

export interface JiraAttachment {
  filename: string;
  author: any;
  created: string;
  size: number;
  mimeType: string;
  content: string;
}

export interface JiraComment {
  id: string;
  author: any;
  body: any;
  created: string;
  updated: string;
}

export interface JiraCommentsResponse {
  comments: JiraComment[];
  maxResults: number;
  startAt: number;
  total: number;
}

export interface LLMFriendlyOutput {
  ticketId: string;
  title: string;
  status?: string;
  issueType?: string;
  priority?: string;
  labels?: string[];
  created: string;
  updated: string;
  reporter?: string;
  assignee?: string;
  description?: string;
  fixVersions?: string[];
  attachments?: Array<{
    filename: string;
    url: string;
    uploadedBy: string;
    uploadedAt: string;
    size: string;
  }>;
  timeline: TimelineEntry[];
  summary: string;
}

export interface TimelineEntry {
  timestamp: string;
  type: 'created' | 'comment' | 'attachment' | 'change';
  author: string;
  content: string;
  metadata?: Record<string, any>;
}

// Create Jira HTTP client
function createJiraClient(baseUrl: string, email: string, apiToken: string): HttpClient {
  return new HttpClient({
    baseURL: baseUrl,
    headers: {
      'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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
  
  // Add comments to timeline
  comments.forEach(comment => {
    const content = JiraFormatter.documentToMarkdown(comment.body);
    timeline.push({
      timestamp: comment.created,
      type: 'comment',
      author: JiraFormatter.formatUser(comment.author),
      content: content,
    });
  });
  
  // Add change history to timeline
  if (issue.changelog?.histories) {
    issue.changelog.histories.forEach(history => {
      history.items.forEach((item: any) => {
        timeline.push({
          timestamp: history.created,
          type: 'change',
          author: JiraFormatter.formatUser(history.author),
          content: `Changed ${item.field}: ${item.fromString || 'empty'} → ${item.toString || 'empty'}`,
          metadata: {
            field: item.field,
            from: item.fromString,
            to: item.toString,
          }
        });
      });
    });
  }
  
  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Filter out change entries - we only want the current state
  const filteredTimeline = timeline.filter(entry => entry.type !== 'change');
  
  // Build attachments list with full URLs
  const attachments = issue.fields.attachment?.map(att => ({
    filename: att.filename,
    url: `${baseUrl}/secure/attachment/${att.content.split('/').pop()}/${encodeURIComponent(att.filename)}`,
    uploadedBy: JiraFormatter.formatUser(att.author),
    uploadedAt: JiraFormatter.formatDate(att.created),
    size: formatFileSize(att.size),
  })) || [];
  
  // Build summary
  const commentCount = comments.length;
  const attachmentCount = issue.fields.attachment?.length || 0;
  const latestActivity = timeline.length > 0 
    ? timeline[timeline.length - 1]
    : null;
  
  const fixVersionsStr = issue.fields.fixVersions?.length 
    ? issue.fields.fixVersions.map(v => v.name).join(', ')
    : 'None';
  
  const summary = `# Jira Ticket ${issue.key}: ${issue.fields.summary}

**Status**: ${issue.fields.status?.name || 'Unknown'}
**Type**: ${issue.fields.issuetype?.name || 'Unknown'}
**Priority**: ${issue.fields.priority?.name || 'None'}
**Fix Version(s)**: ${fixVersionsStr}
**Reporter**: ${JiraFormatter.formatUser(issue.fields.reporter)}
**Assignee**: ${JiraFormatter.formatUser(issue.fields.assignee)}

## Activity Summary
- ${commentCount} comments
- ${attachmentCount} attachments

**Latest activity**: ${latestActivity ? `${JiraFormatter.formatDate(latestActivity.timestamp)} by ${latestActivity.author}` : 'No activity'}`;
  
  return {
    ticketId: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status?.name,
    issueType: issue.fields.issuetype?.name,
    priority: issue.fields.priority?.name,
    labels: issue.fields.labels || [],
    created: JiraFormatter.formatDate(issue.fields.created),
    updated: JiraFormatter.formatDate(issue.fields.updated),
    reporter: JiraFormatter.formatUser(issue.fields.reporter),
    assignee: JiraFormatter.formatUser(issue.fields.assignee),
    description: issue.fields.description ? JiraFormatter.documentToMarkdown(issue.fields.description) : undefined,
    fixVersions: issue.fields.fixVersions?.map(v => v.name) || [],
    attachments,
    timeline: filteredTimeline,
    summary,
  };
}

// Search for tickets using JQL
export async function searchJiraTickets(
  jql: string,
  config: JiraCredentials,
  options: {
    maxResults?: number;
    fields?: string[];
  } = {}
): Promise<JiraIssue[]> {
  const { maxResults = 100, fields = ['summary', 'status', 'issuetype', 'assignee', 'fixVersions'] } = options;
  
  // Create Jira client
  const client = createJiraClient(
    config.JIRA_BASE_URL,
    config.JIRA_EMAIL,
    config.JIRA_API_TOKEN
  );

  logger.debug(`Searching JIRA with JQL: ${jql}`);
  logger.debug(`Fields: ${fields.join(',')}, maxResults: ${maxResults}`);

  try {
    const response = await client.get<{
      issues: JiraIssue[];
      total: number;
      maxResults: number;
    }>(
      `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=${fields.join(',')}`
    );

    logger.debug(`Found ${response.issues.length} issues`);
    return response.issues;
  } catch (error: any) {
    if (error.response?.status === 400) {
      throw new Error(`Invalid JQL query: ${jql}`);
    }
    throw error;
  }
}

// Main function to fetch Jira ticket
export async function fetchJiraTicket(
  ticketId: string, 
  config: JiraCredentials,
  options: {
    includeComments?: boolean;
    includeHistory?: boolean;
    format?: 'llm' | 'raw';
  } = {}
): Promise<any> {
  const { 
    includeComments = true, 
    includeHistory = false,
    format = 'llm' 
  } = options;

  // Create Jira client
  const client = createJiraClient(
    config.JIRA_BASE_URL,
    config.JIRA_EMAIL,
    config.JIRA_API_TOKEN
  );

  logger.debug(`Connecting to Jira at ${config.JIRA_BASE_URL}`);

  // Determine what to expand based on options
  const expandFields = ['renderedFields'];
  if (includeHistory) {
    expandFields.push('changelog');
  }
  
  // Fetch issue details with all requested expansions
  const issue = await client.get<JiraIssue>(
    `/rest/api/3/issue/${ticketId}?expand=${expandFields.join(',')}`
  );

  let comments: JiraComment[] = [];
  
  // Fetch comments if requested
  if (includeComments) {
    const commentsResponse = await client.get<JiraCommentsResponse>(
      `/rest/api/3/issue/${ticketId}/comment`
    );
    comments = commentsResponse.comments;
  }

  // Format based on requested format
  if (format === 'raw') {
    // Raw format - return original Jira response structure
    return {
      issue,
      comments: includeComments ? comments : undefined,
    };
  } else {
    // LLM-friendly format
    return formatForLLM(issue, comments, config.JIRA_BASE_URL);
  }
}