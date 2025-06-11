/**
 * Optimized HTML template for release notes with PDF generation support
 */

export interface ReleaseNotesData {
  title: string;
  date: string;
  version: string;
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
}

export interface CommitInfo {
  hash: string;
  author: string;
  message: string;
}

export class HtmlGenerator {
  private static jiraBaseUrl: string = '';
  private static repoUrl: string = '';
  
  static generateReleaseNotes(data: ReleaseNotesData): string {
    // Store JIRA base URL for use in ticket link generation
    this.jiraBaseUrl = data.jiraBaseUrl || process.env.JIRA_BASE_URL || '';
    this.repoUrl = data.repoUrl || '';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} - ${data.date}</title>
    <style>
        ${this.getOptimizedStyles(data.version)}
    </style>
</head>
<body>
    <div class="container">
        ${this.generateCoverPage(data)}
        ${this.generateExecutiveSummary(data)}
        ${this.generateTicketSummaryTable(data)}
        ${this.generateTicketDetails(data)}
        ${this.generateAppendix(data)}
    </div>
</body>
</html>`;
  }

  private static getOptimizedStyles(version: string): string {
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
            margin-top: 1em;
            margin-bottom: 0.5em;
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
            margin-top: 1.5em;
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
        
        /* Ticket details */
        .ticket-details {
            padding: 2em;
        }
        
        .ticket {
            margin: 2em 0;
            page-break-inside: avoid;
            break-inside: avoid;
            border: 1px solid #ddd;
            padding: 1.5em;
        }
        
        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 1em;
            border-bottom: 1px solid #eee;
            padding-bottom: 0.5em;
        }
        
        .ticket-id {
            font-weight: 700;
            font-size: 12pt;
            color: #2c3e50;
        }
        
        .category-icon {
            font-size: 14pt;
            margin-right: 0.5em;
            vertical-align: middle;
        }
        
        .ticket-meta {
            font-size: 9pt;
            color: #7f8c8d;
        }
        
        .ticket-summary {
            margin: 1em 0;
            font-size: 11pt;
            line-height: 1.6;
        }
        
        .ticket-details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1em;
            margin-top: 1em;
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
            margin-bottom: 0.5em;
            font-weight: 600;
        }
        
        .detail-section ul {
            margin-left: 1.5em;
            line-height: 1.5;
        }
        
        .detail-section li {
            margin: 0.25em 0;
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
            padding: 2em;
            font-size: 9pt;
        }
        
        .commit-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin-top: 1em;
            table-layout: fixed;
        }
        
        .commit-table th,
        .commit-table td {
            padding: 0.3em;
            text-align: left;
            border: 1px solid #ddd;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        
        .commit-table th:first-child,
        .commit-table td:first-child {
            width: 15%;
        }
        
        .commit-table th:nth-child(2),
        .commit-table td:nth-child(2) {
            width: 70%;
        }
        
        .commit-table th:last-child,
        .commit-table td:last-child {
            width: 15%;
        }
        
        .commit-table th {
            background: #f5f5f5;
            font-weight: 600;
        }
        
        .commit-hash {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 7pt;
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
            margin: 2.5cm 2cm 2cm 2cm; /* top right bottom left */
            
            @top-center {
                content: "Release Notes: ${version}";
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
                content: none; /* No header on first page */
            }
        }
    `;
  }

  private static generateCoverPage(data: ReleaseNotesData): string {
    return `
        <div class="cover-page">
            <div class="cover-title">Release Notes</div>
            <div class="cover-subtitle">${data.version}</div>
            <div class="cover-meta">
                <p><strong>Generated:</strong> ${data.date}</p>
                <p><strong>Branch:</strong> ${data.branch.source}</p>
                <p><strong>Compared to:</strong> ${data.branch.target}</p>
                <p><strong>Total Changes:</strong> ${data.stats.totalTickets} tickets, ${data.stats.totalCommits} commits</p>
            </div>
        </div>
    `;
  }

  private static generateExecutiveSummary(data: ReleaseNotesData): string {
    const total = data.stats.totalTickets;
    const criticalCount = data.stats.bugFixes;
    const percentBugFixes = total > 0 ? Math.round((criticalCount / total) * 100) : 0;

    return `
        <section class="executive-summary" style="page-break-after: always;">
            <h1>Executive Summary</h1>
            
            <div class="summary-grid">
                <div class="summary-stat highlight">
                    <div class="stat-value">${data.stats.totalTickets}</div>
                    <div class="stat-label">Total Tickets</div>
                </div>
                <div class="summary-stat">
                    <div class="stat-value">${data.stats.bugFixes}</div>
                    <div class="stat-label">Bug Fixes</div>
                </div>
                <div class="summary-stat">
                    <div class="stat-value">${data.stats.newFeatures}</div>
                    <div class="stat-label">New Features</div>
                </div>
            </div>
            
            <h2>Release Highlights</h2>
            <ul>
                <li><strong>${percentBugFixes}%</strong> of changes are bug fixes, improving system stability</li>
                ${data.stats.newFeatures > 0 ? `<li><strong>${data.stats.newFeatures}</strong> new features enhance user capabilities</li>` : ''}
                ${data.stats.apiChanges > 0 ? `<li><strong>${data.stats.apiChanges}</strong> API changes require integration review</li>` : ''}
                <li>All changes have passed acceptance testing</li>
            </ul>
            
            <h2>Quick Reference</h2>
            <ul>
                <li><strong>Risk Distribution:</strong> ${this.getRiskLevelSummary(data)}</li>
                <li><strong>Primary Focus:</strong> ${data.primaryFocus || this.getPrimaryFocus(data)}</li>
                <li><strong>Total Commits:</strong> ${data.stats.totalCommits}</li>
            </ul>
            
            <h2>Table of Contents</h2>
            <ol style="line-height: 1.8;">
                <li>Executive Summary (this page)</li>
                <li>Change Summary Table</li>
                ${data.categories.bugFixes.length > 0 ? '<li>Critical Bug Fixes</li>' : ''}
                ${data.categories.newFeatures.length > 0 ? '<li>New Features</li>' : ''}
                ${data.categories.apiChanges.length > 0 ? '<li>API Changes</li>' : ''}
                ${(data.categories.uiUpdates.length + data.categories.refactoring.length + data.categories.other.length) > 0 ? '<li>Other Changes</li>' : ''}
                <li>Appendix: Full Commit List</li>
            </ol>
        </section>
    `;
  }


  private static getPrimaryFocus(data: ReleaseNotesData): string {
    // Analyze all ticket descriptions to determine primary focus
    const allTickets = [
      ...data.categories.bugFixes,
      ...data.categories.newFeatures,
      ...data.categories.apiChanges,
      ...data.categories.uiUpdates,
      ...data.categories.refactoring,
      ...data.categories.other
    ];

    // Look for common themes in descriptions
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

    // Find the dominant theme
    const sortedThemes = Object.entries(themes).sort((a, b) => b[1] - a[1]);
    const [topTheme, topCount] = sortedThemes[0];
    const [secondTheme, secondCount] = sortedThemes[1];

    // Generate a more specific focus based on the analysis
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
    
    // If second theme is close in count, mention both
    if (secondCount > 0 && secondCount >= topCount * 0.7) {
      focus += ` & ${focusMap[secondTheme]}`;
    }

    return focus;
  }

  private static getRiskLevelSummary(data: ReleaseNotesData): string {
    // Count tickets by risk level
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
      // Apply same risk assessment logic as assessTicketRisk
      if (ticket.category === 'API' || ticket.commits.length > 5) {
        riskCounts.high++;
      } else if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) {
        riskCounts.medium++;
      } else {
        riskCounts.low++;
      }
    });

    // Build summary string
    const parts = [];
    if (riskCounts.high > 0) parts.push(`${riskCounts.high} High`);
    if (riskCounts.medium > 0) parts.push(`${riskCounts.medium} Medium`);
    if (riskCounts.low > 0) parts.push(`${riskCounts.low} Low`);
    
    return parts.join(', ');
  }


  private static generateTicketSummaryTable(data: ReleaseNotesData): string {
    const allTickets = [
      ...data.categories.bugFixes.map(t => ({ ...t, category: 'Bug Fix' })),
      ...data.categories.newFeatures.map(t => ({ ...t, category: 'Feature' })),
      ...data.categories.apiChanges.map(t => ({ ...t, category: 'API' })),
      ...data.categories.uiUpdates.map(t => ({ ...t, category: 'UI' })),
      ...data.categories.refactoring.map(t => ({ ...t, category: 'Refactor' })),
      ...data.categories.other.map(t => ({ ...t, category: 'Other' })),
    ];

    return `
        <section class="ticket-summary" style="padding: 2em;">
            <h2>Change Summary</h2>
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Ticket</th>
                        <th>Title</th>
                        <th>Category</th>
                        <th>Assignee</th>
                        <th>Risk</th>
                    </tr>
                </thead>
                <tbody>
                    ${allTickets.map(ticket => `
                        <tr>
                            <td><strong><a href="#${ticket.id}" style="color: #2c3e50; text-decoration: none;">${ticket.id}</a></strong></td>
                            <td>${ticket.title}</td>
                            <td>${ticket.category}</td>
                            <td>${ticket.assignee || 'Unassigned'}</td>
                            <td>${this.assessTicketRisk(ticket)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </section>
    `;
  }

  private static assessTicketRisk(ticket: any): string {
    // Simple risk assessment based on commits and category
    if (ticket.category === 'API' || ticket.commits.length > 5) {
      return '<span class="risk-badge risk-high">High</span>';
    }
    if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) {
      return '<span class="risk-badge risk-medium">Medium</span>';
    }
    return '<span class="risk-badge risk-low">Low</span>';
  }

  private static generateTicketDetails(data: ReleaseNotesData): string {
    const sections = [
      { title: '🐛 Critical Bug Fixes', tickets: data.categories.bugFixes },
      { title: '✨ New Features', tickets: data.categories.newFeatures },
      { title: '🔧 API Changes', tickets: data.categories.apiChanges },
      { title: '📦 Other Changes', tickets: [...data.categories.uiUpdates, ...data.categories.refactoring, ...data.categories.other] },
    ];

    return `
        <section class="ticket-details">
            ${sections
              .filter(section => section.tickets.length > 0)
              .map(section => `
                <h2>${section.title}</h2>
                ${section.tickets.map(ticket => this.generateCompactTicket(ticket)).join('')}
              `).join('')}
        </section>
    `;
  }

  private static generateCompactTicket(ticket: TicketInfo): string {
    // Filter out generic testing notes
    const specificTestingNotes = this.filterGenericNotes(ticket.testingNotes || []);
    const specificRisks = this.filterGenericNotes(ticket.risks || []);
    
    // Clean up AI-generated summary prefixes
    const cleanedDescription = this.cleanSummaryText(ticket.description || 'No description available.');
    
    // Determine category icon
    const categoryIcon = this.getCategoryIcon(ticket);

    return `
        <div class="ticket" id="${ticket.id}">
            <div class="ticket-header">
                <div>
                    <span class="category-icon">${categoryIcon}</span>
                    <span class="ticket-id"><a href="${this.getJiraUrl(ticket.id)}" target="_blank" style="color: #2c3e50; text-decoration: none;">${ticket.id}</a></span>
                    <span class="ticket-title">${ticket.title}</span>
                </div>
                <div class="ticket-meta">
                    ${ticket.assignee || 'Unassigned'} | ${ticket.commits.length} commits
                </div>
            </div>
            
            <div class="ticket-summary">
                ${cleanedDescription}
            </div>
            
            <div class="ticket-details-grid">
                <div class="detail-section">
                    <h4>Key Testing Points</h4>
                    ${specificTestingNotes.length > 0 ? `
                        <ul class="compact-list">
                            ${specificTestingNotes.map(note => `<li>${note}</li>`).join('')}
                        </ul>
                    ` : '<p class="no-content">No specific testing notes identified.</p>'}
                </div>
                
                <div class="detail-section">
                    <h4>Risks</h4>
                    ${specificRisks.length > 0 ? `
                        <ul class="compact-list">
                            ${specificRisks.map(risk => `<li>${risk}</li>`).join('')}
                        </ul>
                    ` : '<p class="no-content">No significant risks identified.</p>'}
                </div>
            </div>
        </div>
    `;
  }

  private static filterGenericNotes(notes: string[]): string[] {
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

  private static cleanSummaryText(text: string): string {
    // Remove common AI-generated prefixes
    return text
      .replace(/^(Summary:|Release Note Summary:|Summary for Release Notes:|Here's a concise summary for the release notes:|Here's a concise release notes summary:)\s*/i, '')
      .replace(/^\*\*(.*?)\*\*\s*\n+/, '') // Remove markdown bold titles
      .replace(/^Summary:\s*/i, '')
      .trim();
  }
  
  private static getCategoryIcon(ticket: any): string {
    // Try to determine category from ticket properties or content
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

  private static generateAppendix(data: ReleaseNotesData): string {
    return `
        <section class="appendix">
            <h2>Appendix: Full Commit List</h2>
            <table class="commit-table">
                <thead>
                    <tr>
                        <th>Hash</th>
                        <th>Message</th>
                        <th>Ticket</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.commits.slice(0, 50).map(commit => {
                        const ticketMatch = commit.message.match(/([A-Z]+-\d+)/);
                        const ticketId = ticketMatch ? ticketMatch[1] : null;
                        const shortHash = commit.hash.substring(0, 8);
                        const commitLink = this.getCommitUrl(commit.hash);
                        return `
                            <tr>
                                <td class="commit-hash">${commitLink ? `<a href="${commitLink}" target="_blank" style="color: #2c3e50;">${shortHash}</a>` : shortHash}</td>
                                <td>${commit.message}</td>
                                <td>${ticketId ? `<a href="#${ticketId}" style="color: #2c3e50;">${ticketId}</a>` : '-'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            ${data.commits.length > 50 ? `<p><em>... and ${data.commits.length - 50} more commits</em></p>` : ''}
        </section>
    `;
  }

  private static getJiraUrl(ticketId: string): string {
    // Use stored JIRA base URL or fallback
    const jiraBaseUrl = this.jiraBaseUrl || process.env.JIRA_BASE_URL || 'https://jira.example.com';
    return `${jiraBaseUrl}/browse/${ticketId}`;
  }

  private static getCommitUrl(hash: string): string {
    if (!this.repoUrl) return '';
    
    // Parse git remote URL to construct web URL
    // Handle both SSH and HTTPS formats
    let webUrl = this.repoUrl;
    
    // SSH format: git@bitbucket.org:GatherOurMemories/webapp.git
    if (webUrl.startsWith('git@')) {
      webUrl = webUrl
        .replace('git@', 'https://')
        .replace('.org:', '.org/')
        .replace('.com:', '.com/')
        .replace(/\.git$/, '');
    }
    // HTTPS format: https://bitbucket.org/GatherOurMemories/webapp.git
    else if (webUrl.startsWith('https://')) {
      webUrl = webUrl.replace(/\.git$/, '');
    }
    
    // Construct commit URL based on provider
    if (webUrl.includes('github.com')) {
      return `${webUrl}/commit/${hash}`;
    } else if (webUrl.includes('bitbucket.org')) {
      return `${webUrl}/commits/${hash}`;
    } else if (webUrl.includes('gitlab.com')) {
      return `${webUrl}/-/commit/${hash}`;
    }
    
    // Generic fallback
    return `${webUrl}/commit/${hash}`;
  }
}