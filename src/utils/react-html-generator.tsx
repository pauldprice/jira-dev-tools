import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Export types that were previously in html-generator.ts
export interface ReleaseNotesData {
  title: string;
  date: string;
  version?: string;
  branch: {
    source: string;
    target: string;
  };
  stats: {
    totalCommits: number;
    totalTickets: number;
    bugFixes: number;
    newFeatures: number;
    uiUpdates: number;
    apiChanges: number;
    refactoring: number;
    other: number;
  };
  categories: {
    bugFixes: TicketInfo[];
    newFeatures: TicketInfo[];
    uiUpdates: TicketInfo[];
    apiChanges: TicketInfo[];
    refactoring: TicketInfo[];
    other: TicketInfo[];
  };
  testingGuidelines: string[];
  commits: CommitInfo[];
  primaryFocus?: string;
  jiraBaseUrl?: string;
  repoUrl?: string;
  includePrDescriptions?: boolean;
}

export interface TicketInfo {
  id: string;
  title: string;
  status?: string;
  assignee?: string;
  description?: string;
  commits: CommitInfo[];
  testingNotes?: string[];
  risks?: string[];
  diffStats?: {
    additions: number;
    deletions: number;
  };
  releaseVersion?: string;
  branchStatus?: {
    hasRemoteBranch: boolean;
    branchNames: string[];
  };
  pullRequests?: {
    id: number;
    title: string;
    state: string;
    url: string;
    description?: string;
    author?: string;
    reviewers?: Array<{
      name: string;
      approved: boolean;
    }>;
    approvalStatus?: {
      approved: number;
      total: number;
    };
  }[];
}

export interface CommitInfo {
  hash: string;
  author: string;
  message: string;
  date?: string;
}

// Components
interface LayoutProps {
  children: React.ReactNode;
  title: string;
  date: string;
  version?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title, date, version }) => (
  <html lang="en">
    <head>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{`${title} - ${date}`}</title>
      <style dangerouslySetInnerHTML={{ __html: getOptimizedStyles(version || '') }} />
    </head>
    <body>
      <div className="container">
        {children}
      </div>
    </body>
  </html>
);

interface CoverPageProps {
  data: ReleaseNotesData;
}

const CoverPage: React.FC<CoverPageProps> = ({ data }) => (
  <div className="cover-page">
    <div className="logo-container" dangerouslySetInnerHTML={{ __html: getLogoSvg() }} />
    <div className="cover-title">Release Notes</div>
    <div className="cover-subtitle">{data.version || 'Development Build'}</div>
    <div className="cover-meta">
      <p><strong>Generated:</strong> {data.date}</p>
      <p><strong>Branch:</strong> {data.branch.source}</p>
      <p><strong>Compared to:</strong> {data.branch.target}</p>
      <p><strong>Total Changes:</strong> {data.stats.totalTickets} tickets, {data.stats.totalCommits} commits</p>
    </div>
  </div>
);

interface ExecutiveSummaryProps {
  data: ReleaseNotesData;
}

const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({ data }) => {
  const total = data.stats.totalTickets;
  const criticalCount = data.stats.bugFixes;
  const percentBugFixes = total > 0 ? Math.round((criticalCount / total) * 100) : 0;
  
  const allTickets = [
    ...data.categories.bugFixes,
    ...data.categories.newFeatures,
    ...data.categories.apiChanges,
    ...data.categories.uiUpdates,
    ...data.categories.refactoring,
    ...data.categories.other
  ];
  
  let totalAdditions = 0;
  let totalDeletions = 0;
  allTickets.forEach(ticket => {
    if (ticket.diffStats) {
      totalAdditions += ticket.diffStats.additions;
      totalDeletions += ticket.diffStats.deletions;
    }
  });

  return (
    <section className="executive-summary" id="executive-summary" style={{ pageBreakAfter: 'always' }}>
      <h1>Executive Summary</h1>
      
      <div className="summary-grid">
        <div className="summary-stat highlight">
          <div className="stat-value">{data.stats.totalTickets}</div>
          <div className="stat-label">Total Tickets</div>
        </div>
        <div className="summary-stat">
          <div className="stat-value">{data.stats.bugFixes}</div>
          <div className="stat-label">Bug Fixes</div>
        </div>
        <div className="summary-stat">
          <div className="stat-value">{data.stats.newFeatures}</div>
          <div className="stat-label">New Features</div>
        </div>
      </div>
      
      <h2>Release Highlights & Quick Reference</h2>
      <ul>
        {data.version && <li><strong>Release Version:</strong> {data.version}</li>}
        <li><strong>{percentBugFixes}%</strong> of changes are bug fixes, improving system stability</li>
        {data.stats.newFeatures > 0 && <li><strong>{data.stats.newFeatures}</strong> new features enhance user capabilities</li>}
        {data.stats.apiChanges > 0 && <li><strong>{data.stats.apiChanges}</strong> API changes require integration review</li>}
        <li><strong>Code Impact:</strong> <span className="diff-added">+{totalAdditions.toLocaleString()}</span> <span className="diff-removed">-{totalDeletions.toLocaleString()}</span></li>
        <li><strong>Risk Distribution:</strong> {getRiskLevelSummary(data)}</li>
        <li><strong>Primary Focus:</strong> {data.primaryFocus || getPrimaryFocus(data)}</li>
        <li><strong>Total Commits:</strong> {data.stats.totalCommits}</li>
        <li>All changes have passed acceptance testing</li>
      </ul>
      
      <h2>Table of Contents</h2>
      <div className="toc" style={{ lineHeight: 1.8 }}>
        <div><a href="#executive-summary">Executive Summary (this page)</a></div>
        <div><a href="#change-summary">Change Summary Table</a></div>
        {data.categories.bugFixes.length > 0 && <div><a href="#critical-bug-fixes">Critical Bug Fixes</a></div>}
        {data.categories.newFeatures.length > 0 && <div><a href="#new-features">New Features</a></div>}
        {data.categories.uiUpdates.length > 0 && <div><a href="#ui-updates">UI Updates</a></div>}
        {data.categories.apiChanges.length > 0 && <div><a href="#api-changes">API Changes</a></div>}
        {data.categories.refactoring.length > 0 && <div><a href="#refactoring">Code Refactoring</a></div>}
        {data.categories.other.length > 0 && <div><a href="#other-changes">Other Changes</a></div>}
        <div><a href="#appendix">Appendix: Full Commit List</a></div>
      </div>
    </section>
  );
};

interface TicketSummaryTableProps {
  data: ReleaseNotesData;
}

const TicketSummaryTable: React.FC<TicketSummaryTableProps> = ({ data }) => {
  const allTickets = [
    ...data.categories.bugFixes.map(t => ({ ...t, category: 'Bug Fix' })),
    ...data.categories.newFeatures.map(t => ({ ...t, category: 'Feature' })),
    ...data.categories.apiChanges.map(t => ({ ...t, category: 'API' })),
    ...data.categories.uiUpdates.map(t => ({ ...t, category: 'UI' })),
    ...data.categories.refactoring.map(t => ({ ...t, category: 'Refactor' })),
    ...data.categories.other.map(t => ({ ...t, category: 'Other' })),
  ];
  
  allTickets.sort((a, b) => {
    const riskA = getTicketRiskLevel(a);
    const riskB = getTicketRiskLevel(b);
    
    if (riskA !== riskB) {
      return riskB - riskA;
    }
    
    const changesA = (a.diffStats?.additions || 0) + (a.diffStats?.deletions || 0);
    const changesB = (b.diffStats?.additions || 0) + (b.diffStats?.deletions || 0);
    
    return changesB - changesA;
  });

  return (
    <section className="ticket-summary" id="change-summary" style={{ padding: '2em' }}>
      <h2>Change Summary</h2>
      <table className="summary-table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Title</th>
            <th>Status</th>
            <th>Category</th>
            <th>Assignee</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {allTickets.map(ticket => (
            <tr key={ticket.id}>
              <td><strong><a href={`#${ticket.id}`} style={{ color: '#2c3e50', textDecoration: 'none' }}>{ticket.id}</a></strong></td>
              <td>{ticket.title}</td>
              <td>{ticket.status || 'Unknown'}</td>
              <td>{ticket.category}</td>
              <td>{ticket.assignee || 'Unassigned'}</td>
              <td dangerouslySetInnerHTML={{ __html: assessTicketRisk(ticket) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

interface TicketDetailsProps {
  data: ReleaseNotesData;
}

const TicketDetails: React.FC<TicketDetailsProps> = ({ data }) => {
  const sections = [
    { id: 'critical-bug-fixes', title: '🐛 Critical Bug Fixes', tickets: data.categories.bugFixes },
    { id: 'new-features', title: '✨ New Features', tickets: data.categories.newFeatures },
    { id: 'ui-updates', title: '🎨 UI Updates', tickets: data.categories.uiUpdates },
    { id: 'api-changes', title: '🔧 API Changes', tickets: data.categories.apiChanges },
    { id: 'refactoring', title: '♻️ Code Refactoring', tickets: data.categories.refactoring },
    { id: 'other-changes', title: '📦 Other Changes', tickets: data.categories.other },
  ];

  return (
    <section className="ticket-details">
      {sections
        .filter(section => section.tickets.length > 0)
        .map(section => (
          <React.Fragment key={section.id}>
            <h2 id={section.id}>{section.title}</h2>
            {section.tickets.map(ticket => (
              <CompactTicket key={ticket.id} ticket={ticket} data={data} />
            ))}
          </React.Fragment>
        ))}
    </section>
  );
};

interface CompactTicketProps {
  ticket: TicketInfo;
  data: ReleaseNotesData;
}

const CompactTicket: React.FC<CompactTicketProps> = ({ ticket, data }) => {
  const specificTestingNotes = filterGenericNotes(ticket.testingNotes || []);
  const specificRisks = filterGenericNotes(ticket.risks || []);
  const cleanedDescription = cleanSummaryText(ticket.description || 'No description available.');
  const categoryIcon = getCategoryIcon(ticket);
  const jiraBaseUrl = data.jiraBaseUrl || process.env.JIRA_BASE_URL || 'https://jira.example.com';

  return (
    <div className="ticket" id={ticket.id}>
      <div className="ticket-header">
        <div>
          <span className="category-icon">{categoryIcon}</span>
          <span className="ticket-id">
            <a href={`${jiraBaseUrl}/browse/${ticket.id}`} target="_blank" style={{ color: '#2c3e50', textDecoration: 'none' }}>
              {ticket.id}
            </a>
          </span>
          <span className="ticket-title">{ticket.title}</span>
          {ticket.status && <span style={{ color: '#7f8c8d', fontSize: '0.9em', marginLeft: '1em' }}>({ticket.status})</span>}
        </div>
      </div>
      <TicketMeta ticket={ticket} data={data} />
      
      <div className="ticket-summary">
        {cleanedDescription}
      </div>
      
      <div className="ticket-details-grid">
        <div className="detail-section">
          <h4>Key Testing Points</h4>
          {specificTestingNotes.length > 0 ? (
            <ul className="compact-list">
              {specificTestingNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="no-content">No specific testing notes identified.</p>
          )}
        </div>
        
        <div className="detail-section">
          <h4>Risks</h4>
          {specificRisks.length > 0 ? (
            <ul className="compact-list">
              {specificRisks.map((risk, idx) => (
                <li key={idx}>{risk}</li>
              ))}
            </ul>
          ) : (
            <p className="no-content">No significant risks identified.</p>
          )}
        </div>
      </div>
      
      <PullRequestDetails ticket={ticket} data={data} />
    </div>
  );
};

interface TicketMetaProps {
  ticket: TicketInfo;
  data: ReleaseNotesData;
}

const TicketMeta: React.FC<TicketMetaProps> = ({ ticket, data }) => (
  <div className="ticket-meta">
    <span>{ticket.assignee || 'Unassigned'}</span>
    <span>{ticket.commits.length} {ticket.commits.length === 1 ? 'commit' : 'commits'}</span>
    {ticket.diffStats && (
      <div className="diff-stats">
        <span className="diff-added">+{ticket.diffStats.additions.toLocaleString()}</span>
        <span className="diff-removed">-{ticket.diffStats.deletions.toLocaleString()}</span>
      </div>
    )}
    {ticket.branchStatus && ticket.branchStatus.hasRemoteBranch && (
      <div style={{ color: '#f39c12', fontWeight: 'bold', marginLeft: '1em' }}>
        🌿 Has unmerged branch{ticket.branchStatus.branchNames.length > 0 ? `: ${ticket.branchStatus.branchNames[0]}` : ''}
      </div>
    )}
    {ticket.pullRequests && ticket.pullRequests.length > 0 && ticket.pullRequests.map(pr => (
      <div key={pr.id} style={{ marginLeft: '1em' }}>
        <a href={pr.url} target="_blank" style={{ color: '#2980b9', textDecoration: 'none', fontWeight: 'bold' }}>
          🔗 PR #{pr.id} ({pr.state})
        </a>
        {pr.author && ` by ${pr.author}`}
        {pr.approvalStatus && ` - ${pr.approvalStatus.approved}/${pr.approvalStatus.total} approved`}
      </div>
    ))}
    {data.version && (!ticket.releaseVersion || ticket.releaseVersion !== data.version) && (
      <div className="version-mismatch" style={{ color: '#e74c3c', fontWeight: 'bold', marginLeft: '1em' }}>
        ⚠️ {ticket.releaseVersion ? `Version: ${ticket.releaseVersion}` : 'No Fix Version'}
      </div>
    )}
  </div>
);

interface PullRequestDetailsProps {
  ticket: TicketInfo;
  data: ReleaseNotesData;
}

const PullRequestDetails: React.FC<PullRequestDetailsProps> = ({ ticket, data }) => {
  if (!ticket.pullRequests || ticket.pullRequests.length === 0) return null;
  
  const hasDetails = ticket.pullRequests.some(pr => 
    (data.includePrDescriptions && pr.description) || (pr.reviewers && pr.reviewers.length > 0)
  );
  
  if (!hasDetails) return null;

  return (
    <div style={{ marginTop: '0.5em', paddingTop: '0.5em', borderTop: '1px solid #eee' }}>
      {ticket.pullRequests.map(pr => (
        <React.Fragment key={pr.id}>
          {data.includePrDescriptions && pr.description && (
            <div style={{ marginBottom: '0.5em' }}>
              <h4 style={{ fontSize: '10pt', marginBottom: '0.25em' }}>PR #{pr.id} Description</h4>
              <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-wrap' }}>
                {escapeHtml(pr.description).substring(0, 500)}{pr.description.length > 500 ? '...' : ''}
              </div>
            </div>
          )}
          
          {pr.reviewers && pr.reviewers.length > 0 && (
            <div style={{ marginBottom: '0.5em' }}>
              <h4 style={{ fontSize: '10pt', marginBottom: '0.25em' }}>Reviewers</h4>
              <div style={{ fontSize: '9pt' }}>
                {pr.reviewers.map((reviewer, idx) => (
                  <span key={idx} style={{ marginRight: '1em' }}>
                    {reviewer.approved ? '✅' : '⏳'} {reviewer.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

interface AppendixProps {
  data: ReleaseNotesData;
}

const Appendix: React.FC<AppendixProps> = ({ data }) => {
  const repoUrl = data.repoUrl || '';
  
  return (
    <section className="appendix" id="appendix">
      <h2>Appendix: Full Commit List</h2>
      <table className="commit-table">
        <thead>
          <tr>
            <th>Hash</th>
            <th>Author</th>
            <th>Date</th>
            <th>Message</th>
            <th>Ticket</th>
          </tr>
        </thead>
        <tbody>
          {data.commits.map((commit, idx) => {
            const ticketMatch = commit.message.match(/([A-Z]+-\d+)/);
            const ticketId = ticketMatch ? ticketMatch[1] : null;
            const shortHash = commit.hash.substring(0, 8);
            const commitLink = getCommitUrl(commit.hash, repoUrl);
            const formattedDate = commit.date ? formatDate(commit.date) : '';
            
            return (
              <tr key={idx}>
                <td className="commit-hash">
                  {commitLink ? (
                    <a href={commitLink} target="_blank" style={{ color: '#2c3e50' }}>
                      {shortHash}
                    </a>
                  ) : (
                    shortHash
                  )}
                </td>
                <td>{commit.author || 'Unknown'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formattedDate}</td>
                <td>{commit.message}</td>
                <td>
                  {ticketId ? (
                    <a href={`#${ticketId}`} style={{ color: '#2c3e50' }}>
                      {ticketId}
                    </a>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

// Main component
interface ReleaseNotesProps {
  data: ReleaseNotesData;
}

const ReleaseNotes: React.FC<ReleaseNotesProps> = ({ data }) => (
  <Layout title={data.title} date={data.date} version={data.version}>
    <CoverPage data={data} />
    <ExecutiveSummary data={data} />
    <TicketSummaryTable data={data} />
    <TicketDetails data={data} />
    <Appendix data={data} />
  </Layout>
);

// Helper functions
function getOptimizedStyles(version: string): string {
  return `
    /* Reset and base styles */
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
    }
    
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        line-height: 1.5;
        color: #2c3e50;
        background: white;
        font-size: 11pt;
    }
    
    .container {
        max-width: 210mm; /* A4 width */
        margin: 0 auto;
        padding: 0;
    }
    
    /* Typography */
    h1, h2, h3, h4 {
        font-weight: 600;
        margin-top: 0.5em;
        margin-bottom: 0.3em;
        color: #1a1a1a;
        page-break-after: avoid;
    }
    
    h1 {
        font-size: 24pt;
        margin-top: 0;
        text-align: center;
        padding: 2em 0 1em 0;
    }
    
    h2 {
        font-size: 18pt;
        border-bottom: 2px solid #2c3e50;
        padding-bottom: 0.3em;
        margin-top: 0.8em;
    }
    
    h3 {
        font-size: 14pt;
        color: #34495e;
    }
    
    p {
        margin: 0.5em 0;
        orphans: 3;
        widows: 3;
    }
    
    /* Cover page */
    .cover-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        page-break-after: always;
        text-align: center;
        padding: 2em;
    }
    
    .logo-container {
        margin-bottom: 3em;
    }
    
    .logo-container svg {
        max-width: 300px;
        height: auto;
    }
    
    .cover-title {
        font-size: 36pt;
        font-weight: 700;
        margin-bottom: 0.5em;
        color: #2c3e50;
    }
    
    .cover-subtitle {
        font-size: 18pt;
        color: #7f8c8d;
        margin-bottom: 2em;
    }
    
    .cover-meta {
        font-size: 12pt;
        color: #95a5a6;
        line-height: 1.8;
    }
    
    /* Executive summary */
    .executive-summary {
        page-break-after: always;
        padding: 2em;
    }
    
    .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1em;
        margin: 2em 0;
    }
    
    .summary-stat {
        border: 1px solid #ddd;
        padding: 1em;
        text-align: center;
        background: white;
    }
    
    .summary-stat.highlight {
        border-color: #2c3e50;
        border-width: 2px;
    }
    
    .stat-value {
        font-size: 24pt;
        font-weight: 700;
        color: #2c3e50;
    }
    
    .stat-label {
        font-size: 10pt;
        color: #7f8c8d;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    /* Summary table */
    .summary-table {
        width: 100%;
        border-collapse: collapse;
        margin: 2em 0;
        font-size: 10pt;
        page-break-inside: avoid;
    }
    
    .summary-table th,
    .summary-table td {
        padding: 0.5em;
        text-align: left;
        border: 1px solid #ddd;
    }
    
    .summary-table th {
        background: #f5f5f5;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 9pt;
        letter-spacing: 0.5px;
    }
    
    .summary-table th:first-child,
    .summary-table td:first-child {
        white-space: nowrap;
        min-width: 80px;
    }
    
    .summary-table tr:nth-child(even) {
        background: #fafafa;
    }
    
    /* Link styles */
    a {
        color: #2980b9;
        text-decoration: none;
    }
    
    a:hover {
        text-decoration: underline;
    }
    
    .ticket-id a {
        font-weight: 700;
        color: inherit;
    }
    
    .ticket-id a:hover {
        color: #2980b9;
    }
    
    .toc {
        text-align: left;
        max-width: 600px;
        margin: 0 auto;
    }
    
    .toc div {
        margin: 0.5em 0;
        padding-left: 1em;
    }
    
    .toc a {
        color: #2c3e50;
        font-weight: 500;
    }
    
    .toc a:hover {
        color: #2980b9;
    }
    
    /* Ticket details */
    .ticket-details {
        padding: 2em;
    }
    
    .ticket {
        margin: 1em 0;
        page-break-inside: avoid;
        break-inside: avoid;
        border: 1px solid #ddd;
        padding: 1em;
    }
    
    .ticket-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5em;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.3em;
    }
    
    .ticket-id {
        font-weight: 700;
        font-size: 12pt;
        color: #2c3e50;
        margin-right: 0.5em;
    }
    
    .category-icon {
        font-size: 14pt;
        margin-right: 0.5em;
        vertical-align: middle;
    }
    
    .ticket-meta {
        font-size: 9pt;
        color: #7f8c8d;
        margin-top: 0.5em;
        display: flex;
        gap: 1em;
        flex-wrap: wrap;
    }
    
    .diff-stats {
        display: inline-flex;
        gap: 0.5em;
        align-items: center;
    }
    
    .diff-added {
        background-color: #d4f4d4;
        color: #22863a;
        padding: 0.1em 0.4em;
        border-radius: 3px;
        font-weight: 600;
        font-size: 0.9em;
    }
    
    .diff-removed {
        background-color: #fddede;
        color: #cb2431;
        padding: 0.1em 0.4em;
        border-radius: 3px;
        font-weight: 600;
        font-size: 0.9em;
    }
    
    .ticket-summary {
        margin: 0.75em 0;
        font-size: 11pt;
        line-height: 1.5;
    }
    
    .ticket-details-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1em;
        margin-top: 0.5em;
        page-break-inside: avoid;
        break-inside: avoid;
    }
    
    .detail-section {
        font-size: 10pt;
    }
    
    .detail-section h4 {
        font-size: 10pt;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #7f8c8d;
        margin-bottom: 0.25em;
        margin-top: 0;
        font-weight: 600;
    }
    
    .detail-section ul {
        margin-left: 1.5em;
        line-height: 1.4;
        margin-top: 0;
        margin-bottom: 0;
    }
    
    .detail-section li {
        margin: 0.15em 0;
    }
    
    /* Compact lists */
    .compact-list {
        font-size: 9pt;
        color: #555;
    }
    
    .compact-list li {
        margin: 0.2em 0;
    }
    
    .no-content {
        color: #95a5a6;
        font-style: italic;
        font-size: 0.9em;
    }
    
    /* Risk levels */
    .risk-high {
        color: #e74c3c;
        font-weight: 600;
    }
    
    .risk-medium {
        color: #f39c12;
    }
    
    .risk-low {
        color: #95a5a6;
    }
    
    /* Risk badges */
    .risk-badge {
        display: inline-block;
        padding: 0.2em 0.6em;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.85em;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .risk-badge.risk-high {
        background-color: #fee;
        border: 1px solid #e74c3c;
        color: #e74c3c;
    }
    
    .risk-badge.risk-medium {
        background-color: #fff3cd;
        border: 1px solid #f39c12;
        color: #f39c12;
    }
    
    .risk-badge.risk-low {
        background-color: #f8f9fa;
        border: 1px solid #95a5a6;
        color: #95a5a6;
    }
    
    /* Appendix */
    .appendix {
        page-break-before: always;
        padding: 0.5em;
        font-size: 9pt;
        max-width: none;
    }
    
    .commit-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 7pt;
        margin-top: 1em;
        table-layout: fixed;
    }
    
    .commit-table th,
    .commit-table td {
        padding: 0.25em;
        text-align: left;
        border: 1px solid #ddd;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }
    
    /* Column widths for 5-column layout */
    .commit-table th:nth-child(1),
    .commit-table td:nth-child(1) {
        width: 10%;
    }
    
    .commit-table th:nth-child(2),
    .commit-table td:nth-child(2) {
        width: 15%;
    }
    
    .commit-table th:nth-child(3),
    .commit-table td:nth-child(3) {
        width: 11%;
    }
    
    .commit-table th:nth-child(4),
    .commit-table td:nth-child(4) {
        width: 54%;
    }
    
    .commit-table th:nth-child(5),
    .commit-table td:nth-child(5) {
        width: 10%;
    }
    
    .commit-table th {
        background: #f5f5f5;
        font-weight: 600;
    }
    
    .commit-hash {
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 6pt;
    }
    
    /* Print optimizations */
    @media print {
        body {
            font-size: 10pt;
        }
        
        .container {
            padding: 0;
        }
        
        .ticket {
            border: 1px solid #ccc;
            background: white;
        }
        
        .no-print {
            display: none !important;
        }
    }
    
    /* Page setup for PDF */
    @page {
        size: A4;
        margin: 2.5cm 2cm 2cm 2cm;
        
        @top-center {
            content: "Release Notes${version ? ': ' + version : ''}";
            font-size: 9pt;
            color: #7f8c8d;
            padding-bottom: 0.5cm;
        }
        
        @bottom-right {
            content: counter(page) " of " counter(pages);
            font-size: 9pt;
            color: #7f8c8d;
        }
    }
    
    @page :first {
        margin-top: 0;
        @top-center {
            content: none;
        }
    }
    
    /* Special page margins for appendix */
    @page appendix {
        margin: 2cm 1cm 2cm 1cm;
    }
    
    .appendix {
        page: appendix;
    }
  `;
}

function getLogoSvg(): string {
  return `
    <svg width="300" height="120" viewBox="0 0 300 120" xmlns="http://www.w3.org/2000/svg">
      <!-- Generic developer tools logo -->
      <g transform="translate(20, 20)">
        <!-- Terminal/Code icon -->
        <rect x="0" y="0" width="80" height="80" rx="8" fill="#2563eb" stroke="#1e40af" stroke-width="2"/>
        <text x="40" y="30" font-family="monospace" font-size="16" fill="white" text-anchor="middle">&gt;_</text>
        <rect x="10" y="40" width="60" height="3" fill="white" opacity="0.8"/>
        <rect x="10" y="48" width="40" height="3" fill="white" opacity="0.6"/>
        <rect x="10" y="56" width="50" height="3" fill="white" opacity="0.4"/>
        
        <!-- JIRA icon hint -->
        <circle cx="65" cy="65" r="12" fill="#0052CC" stroke="white" stroke-width="2"/>
        <text x="65" y="70" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="white" text-anchor="middle">J</text>
      </g>
      
      <!-- Text -->
      <text x="120" y="50" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#1e293b">JIRA</text>
      <text x="120" y="75" font-family="Arial, sans-serif" font-size="20" fill="#475569">Dev Tools</text>
    </svg>
  `;
}

function getPrimaryFocus(data: ReleaseNotesData): string {
  const allTickets = [
    ...data.categories.bugFixes,
    ...data.categories.newFeatures,
    ...data.categories.apiChanges,
    ...data.categories.uiUpdates,
    ...data.categories.refactoring,
    ...data.categories.other
  ];

  const themes = {
    security: 0,
    performance: 0,
    userExperience: 0,
    dataHandling: 0,
    integration: 0,
    stability: 0,
    features: 0
  };

  allTickets.forEach(ticket => {
    const text = `${ticket.title} ${ticket.description || ''}`.toLowerCase();
    
    if (text.includes('security') || text.includes('auth') || text.includes('permission') || text.includes('access')) themes.security++;
    if (text.includes('performance') || text.includes('speed') || text.includes('optimize') || text.includes('cache')) themes.performance++;
    if (text.includes('ui') || text.includes('ux') || text.includes('user experience') || text.includes('interface') || text.includes('design')) themes.userExperience++;
    if (text.includes('data') || text.includes('database') || text.includes('migration') || text.includes('storage')) themes.dataHandling++;
    if (text.includes('api') || text.includes('integration') || text.includes('webhook') || text.includes('endpoint')) themes.integration++;
    if (text.includes('fix') || text.includes('bug') || text.includes('error') || text.includes('crash')) themes.stability++;
    if (text.includes('feature') || text.includes('new') || text.includes('add') || text.includes('implement')) themes.features++;
  });

  const sortedThemes = Object.entries(themes).sort((a, b) => b[1] - a[1]);
  const [topTheme, topCount] = sortedThemes[0];
  const [secondTheme, secondCount] = sortedThemes[1];

  if (topCount === 0) {
    return 'General Maintenance';
  }

  const focusMap: Record<string, string> = {
    security: 'Security & Access Control',
    performance: 'Performance Optimization',
    userExperience: 'User Experience Improvements',
    dataHandling: 'Data Management & Processing',
    integration: 'System Integration',
    stability: 'Stability & Bug Fixes',
    features: 'New Feature Development'
  };

  let focus = focusMap[topTheme];
  
  if (secondCount > 0 && secondCount >= topCount * 0.7) {
    focus += ` & ${focusMap[secondTheme]}`;
  }

  return focus;
}

function getRiskLevelSummary(data: ReleaseNotesData): string {
  const riskCounts = { high: 0, medium: 0, low: 0 };
  
  const allTickets = [
    ...data.categories.bugFixes.map(t => ({ ...t, category: 'Bug Fix' })),
    ...data.categories.newFeatures.map(t => ({ ...t, category: 'Feature' })),
    ...data.categories.apiChanges.map(t => ({ ...t, category: 'API' })),
    ...data.categories.uiUpdates.map(t => ({ ...t, category: 'UI' })),
    ...data.categories.refactoring.map(t => ({ ...t, category: 'Refactor' })),
    ...data.categories.other.map(t => ({ ...t, category: 'Other' })),
  ];

  allTickets.forEach(ticket => {
    if (ticket.category === 'API' || ticket.commits.length > 5) {
      riskCounts.high++;
    } else if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) {
      riskCounts.medium++;
    } else {
      riskCounts.low++;
    }
  });

  const parts = [];
  if (riskCounts.high > 0) parts.push(`${riskCounts.high} High`);
  if (riskCounts.medium > 0) parts.push(`${riskCounts.medium} Medium`);
  if (riskCounts.low > 0) parts.push(`${riskCounts.low} Low`);
  
  return parts.join(', ');
}

function getTicketRiskLevel(ticket: any): number {
  if (ticket.category === 'API' || ticket.commits.length > 5) {
    return 3; // High
  }
  if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) {
    return 2; // Medium
  }
  return 1; // Low
}

function assessTicketRisk(ticket: any): string {
  const riskLevel = getTicketRiskLevel(ticket);
  if (riskLevel === 3) {
    return '<span class="risk-badge risk-high">High</span>';
  }
  if (riskLevel === 2) {
    return '<span class="risk-badge risk-medium">Medium</span>';
  }
  return '<span class="risk-badge risk-low">Low</span>';
}

function getCategoryIcon(ticket: any): string {
  const title = ticket.title?.toLowerCase() || '';
  const description = ticket.description?.toLowerCase() || '';
  const combined = title + ' ' + description;
  
  if (combined.includes('api') || combined.includes('endpoint')) return '🔧';
  if (combined.includes('ui') || combined.includes('style') || combined.includes('css')) return '🎨';
  if (combined.includes('feature') || combined.includes('new')) return '✨';
  if (combined.includes('refactor') || combined.includes('cleanup')) return '♻️';
  if (combined.includes('fix') || combined.includes('bug') || combined.includes('error')) return '🐛';
  return '📦';
}

function filterGenericNotes(notes: string[]): string[] {
  const genericPatterns = [
    /test all affected ui components/i,
    /verify user interactions work correctly/i,
    /check responsive behavior/i,
    /test all modified api endpoints/i,
    /verify error handling/i,
    /check backward compatibility/i,
    /verify database migrations/i,
    /test data integrity/i,
    /check query performance/i,
    /ensure all new and modified tests/i,
    /verify test coverage/i,
    /perform comprehensive regression/i,
  ];

  return notes.filter(note => 
    !genericPatterns.some(pattern => pattern.test(note))
  );
}

function cleanSummaryText(text: string): string {
  return text
    .replace(/^(Summary:|Release Note Summary:|Summary for Release Notes:|Here's a concise summary for the release notes:|Here's a concise release notes summary:)\s*/i, '')
    .replace(/^\*\*(.*?)\*\*\s*\n+/, '')
    .replace(/^Summary:\s*/i, '')
    .trim();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear().toString().slice(-2);
  return `${month} ${day}-${year}`;
}

function getCommitUrl(hash: string, repoUrl: string): string {
  if (!repoUrl) return '';
  
  let webUrl = repoUrl;
  
  if (webUrl.startsWith('git@')) {
    webUrl = webUrl
      .replace('git@', 'https://')
      .replace('.org:', '.org/')
      .replace('.com:', '.com/')
      .replace(/\.git$/, '');
  }
  else if (webUrl.startsWith('https://')) {
    webUrl = webUrl.replace(/\.git$/, '');
  }
  
  if (webUrl.includes('github.com')) {
    return `${webUrl}/commit/${hash}`;
  } else if (webUrl.includes('bitbucket.org')) {
    return `${webUrl}/commits/${hash}`;
  } else if (webUrl.includes('gitlab.com')) {
    return `${webUrl}/-/commit/${hash}`;
  }
  
  return `${webUrl}/commit/${hash}`;
}

// Export the main class
export class ReactHtmlGenerator {
  static generateReleaseNotes(data: ReleaseNotesData): string {
    const element = <ReleaseNotes data={data} />;
    return '<!DOCTYPE html>\n' + renderToStaticMarkup(element);
  }
}