/**
 * HTML template and generation utilities for release notes
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
  static generateReleaseNotes(data: ReleaseNotesData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
    <style>
        ${this.getStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${this.generateHeader(data)}
        ${this.generateExecutiveSummary(data)}
        ${this.generateTableOfContents()}
        ${this.generateTestingGuidelines(data)}
        ${this.generateTicketSections(data)}
        ${this.generateCommitList(data)}
        ${this.generateFooter(data)}
    </div>
</body>
</html>`;
  }

  private static getStyles(): string {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        
        h1, h2, h3, h4 {
            margin-top: 1.5em;
            margin-bottom: 0.5em;
            color: #2c3e50;
        }
        
        h1 {
            font-size: 2.5em;
            border-bottom: 3px solid #3498db;
            padding-bottom: 0.5em;
            margin-bottom: 1em;
        }
        
        h2 {
            font-size: 2em;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 0.3em;
            page-break-after: avoid;
        }
        
        h3 {
            font-size: 1.5em;
            color: #34495e;
            page-break-after: avoid;
        }
        
        .header-info {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        
        .header-info p {
            margin: 5px 0;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
            text-align: center;
        }
        
        .stat-card.bug { border-left-color: #e74c3c; }
        .stat-card.feature { border-left-color: #2ecc71; }
        .stat-card.ui { border-left-color: #9b59b6; }
        .stat-card.api { border-left-color: #f39c12; }
        .stat-card.refactor { border-left-color: #1abc9c; }
        .stat-card.other { border-left-color: #95a5a6; }
        
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #2c3e50;
        }
        
        .stat-label {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        .toc {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        
        .toc ul {
            list-style: none;
            padding-left: 20px;
        }
        
        .toc a {
            color: #3498db;
            text-decoration: none;
        }
        
        .toc a:hover {
            text-decoration: underline;
        }
        
        .ticket-section {
            margin: 30px 0;
            page-break-inside: avoid;
        }
        
        .ticket {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border: 1px solid #e0e0e0;
            page-break-inside: avoid;
        }
        
        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .ticket-id {
            font-weight: bold;
            color: #3498db;
            font-size: 1.1em;
        }
        
        .ticket-status {
            background: #2ecc71;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.8em;
        }
        
        .ticket-title {
            font-weight: bold;
            margin: 10px 0;
            color: #2c3e50;
        }
        
        .ticket-meta {
            font-size: 0.9em;
            color: #7f8c8d;
            margin: 5px 0;
        }
        
        .commits-list {
            background: #ecf0f1;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.9em;
        }
        
        .testing-notes {
            background: #e8f4f8;
            border-left: 4px solid #3498db;
            padding: 10px 15px;
            margin: 10px 0;
        }
        
        .testing-notes ul {
            margin-left: 20px;
        }
        
        .risks {
            background: #fef5e7;
            border-left: 4px solid #f39c12;
            padding: 10px 15px;
            margin: 10px 0;
        }
        
        .full-commit-list {
            margin-top: 40px;
            page-break-before: always;
        }
        
        details {
            margin: 20px 0;
        }
        
        summary {
            cursor: pointer;
            font-weight: bold;
            color: #3498db;
            margin-bottom: 10px;
        }
        
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            font-size: 0.85em;
        }
        
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #ecf0f1;
            text-align: center;
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        @media print {
            body {
                background: white;
            }
            
            .container {
                box-shadow: none;
                max-width: 100%;
            }
            
            .page-break {
                page-break-after: always;
            }
            
            .no-print {
                display: none;
            }
        }
    `;
  }

  private static generateHeader(data: ReleaseNotesData): string {
    return `
        <h1>${data.title}</h1>
        <div class="header-info">
            <p><strong>Generated:</strong> ${data.date}</p>
            <p><strong>Version:</strong> ${data.version}</p>
            <p><strong>Branch:</strong> ${data.branch.source} (compared to ${data.branch.target})</p>
            <p><strong>Total Commits:</strong> ${data.stats.totalCommits}</p>
            <p><strong>Total Tickets:</strong> ${data.stats.totalTickets}</p>
        </div>
    `;
  }

  private static generateExecutiveSummary(data: ReleaseNotesData): string {
    return `
        <section id="summary">
            <h2>Executive Summary</h2>
            <p>This release candidate includes ${data.stats.totalTickets} tickets with the following distribution:</p>
            
            <div class="stats-grid">
                <div class="stat-card bug">
                    <div class="stat-number">${data.stats.bugFixes}</div>
                    <div class="stat-label">🐛 Bug Fixes</div>
                </div>
                <div class="stat-card feature">
                    <div class="stat-number">${data.stats.newFeatures}</div>
                    <div class="stat-label">✨ New Features</div>
                </div>
                <div class="stat-card ui">
                    <div class="stat-number">${data.stats.uiUpdates}</div>
                    <div class="stat-label">🎨 UI Updates</div>
                </div>
                <div class="stat-card api">
                    <div class="stat-number">${data.stats.apiChanges}</div>
                    <div class="stat-label">🔧 API Changes</div>
                </div>
                <div class="stat-card refactor">
                    <div class="stat-number">${data.stats.refactoring}</div>
                    <div class="stat-label">♻️ Refactoring</div>
                </div>
                <div class="stat-card other">
                    <div class="stat-number">${data.stats.other}</div>
                    <div class="stat-label">📦 Other</div>
                </div>
            </div>
        </section>
    `;
  }

  private static generateTableOfContents(): string {
    return `
        <section id="toc" class="toc">
            <h2>Table of Contents</h2>
            <ul>
                <li><a href="#testing">Testing Guidelines</a></li>
                <li><a href="#bug-fixes">🐛 Bug Fixes</a></li>
                <li><a href="#new-features">✨ New Features</a></li>
                <li><a href="#ui-updates">🎨 UI Updates</a></li>
                <li><a href="#api-changes">🔧 API Changes</a></li>
                <li><a href="#refactoring">♻️ Refactoring</a></li>
                <li><a href="#other">📦 Other Changes</a></li>
                <li><a href="#commits">Full Commit List</a></li>
            </ul>
        </section>
    `;
  }

  private static generateTestingGuidelines(data: ReleaseNotesData): string {
    return `
        <section id="testing" class="page-break">
            <h2>Testing Guidelines</h2>
            
            <h3>Pre-Release Checklist</h3>
            <ul>
                ${data.testingGuidelines.map(guideline => `<li>${guideline}</li>`).join('\n')}
            </ul>
            
            <h3>Focus Areas by Category</h3>
            <ul>
                <li><strong>Bug Fixes:</strong> Verify original issues are resolved, test for regressions</li>
                <li><strong>New Features:</strong> Full functionality testing with edge cases</li>
                <li><strong>UI Updates:</strong> Cross-browser testing, mobile responsiveness</li>
                <li><strong>API Changes:</strong> Endpoint testing, backward compatibility checks</li>
                <li><strong>Refactoring:</strong> Regression testing, performance comparison</li>
            </ul>
        </section>
    `;
  }

  private static generateTicketSections(data: ReleaseNotesData): string {
    const sections = [
      { id: 'bug-fixes', title: '🐛 Bug Fixes', tickets: data.categories.bugFixes },
      { id: 'new-features', title: '✨ New Features', tickets: data.categories.newFeatures },
      { id: 'ui-updates', title: '🎨 UI Updates', tickets: data.categories.uiUpdates },
      { id: 'api-changes', title: '🔧 API Changes', tickets: data.categories.apiChanges },
      { id: 'refactoring', title: '♻️ Refactoring', tickets: data.categories.refactoring },
      { id: 'other', title: '📦 Other Changes', tickets: data.categories.other },
    ];

    return sections
      .filter(section => section.tickets.length > 0)
      .map(section => `
        <section id="${section.id}" class="ticket-section">
            <h2>${section.title}</h2>
            ${section.tickets.map(ticket => this.generateTicket(ticket)).join('\n')}
        </section>
      `).join('\n');
  }

  private static generateTicket(ticket: TicketInfo): string {
    return `
        <div class="ticket">
            <div class="ticket-header">
                <span class="ticket-id">${ticket.id}</span>
                ${ticket.status ? `<span class="ticket-status">${ticket.status}</span>` : ''}
            </div>
            <div class="ticket-title">${ticket.title}</div>
            ${ticket.assignee ? `<div class="ticket-meta">Assignee: ${ticket.assignee}</div>` : ''}
            
            ${ticket.description ? `<div class="ticket-description">${ticket.description}</div>` : ''}
            
            <div class="commits-list">
                <strong>Commits:</strong><br>
                ${ticket.commits.slice(0, 5).map(c => `${c.hash} ${c.message}`).join('<br>')}
                ${ticket.commits.length > 5 ? `<br>... and ${ticket.commits.length - 5} more commits` : ''}
            </div>
            
            ${ticket.testingNotes && ticket.testingNotes.length > 0 ? `
                <div class="testing-notes">
                    <strong>Testing Notes:</strong>
                    <ul>
                        ${ticket.testingNotes.map(note => `<li>${note}</li>`).join('\n')}
                    </ul>
                </div>
            ` : ''}
            
            ${ticket.risks && ticket.risks.length > 0 ? `
                <div class="risks">
                    <strong>Potential Risks:</strong>
                    <ul>
                        ${ticket.risks.map(risk => `<li>${risk}</li>`).join('\n')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
  }

  private static generateCommitList(data: ReleaseNotesData): string {
    return `
        <section id="commits" class="full-commit-list">
            <h2>Full Commit List</h2>
            <details>
                <summary>Click to expand all commits</summary>
                <pre>${data.commits.map(c => `${c.hash} ${c.message}`).join('\n')}</pre>
            </details>
        </section>
    `;
  }

  private static generateFooter(data: ReleaseNotesData): string {
    return `
        <footer class="footer">
            <p>${data.version}</p>
            <p>For questions or improvements, contact the development team</p>
        </footer>
    `;
  }
}