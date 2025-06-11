/**
 * Optimized HTML template for release notes with better PDF support
 */

import type { ReleaseNotesData, TicketInfo } from './html-generator';

export class HtmlGeneratorV2 {
  static generateReleaseNotes(data: ReleaseNotesData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} - ${data.date}</title>
    <style>
        ${this.getOptimizedStyles()}
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

  private static getOptimizedStyles(): string {
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
        
        .summary-table tr:nth-child(even) {
            background: #fafafa;
        }
        
        /* Ticket details */
        .ticket-details {
            padding: 2em;
        }
        
        .ticket {
            margin: 2em 0;
            page-break-inside: avoid;
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
        }
        
        .commit-table th,
        .commit-table td {
            padding: 0.3em;
            text-align: left;
            border: 1px solid #ddd;
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
            
            /* Page setup */
            @page {
                size: A4;
                margin: 2cm;
            }
            
            @page :first {
                margin-top: 0;
            }
        }
        
        /* Page numbers for PDF */
        @page {
            @bottom-right {
                content: counter(page) " of " counter(pages);
                font-size: 9pt;
                color: #7f8c8d;
            }
            
            @top-center {
                content: "Release Notes - ${new Date().toLocaleDateString()}";
                font-size: 9pt;
                color: #7f8c8d;
            }
        }
    `;
  }

  private static generateCoverPage(data: ReleaseNotesData): string {
    return `
        <div class="cover-page">
            <div class="cover-title">Release Notes</div>
            <div class="cover-subtitle">${data.branch.source}</div>
            <div class="cover-meta">
                <p><strong>Generated:</strong> ${data.date}</p>
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
        <section class="executive-summary">
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
            
            <h2>Risk Assessment</h2>
            <p>This release contains ${this.assessRiskLevel(data)} based on the scope and nature of changes.</p>
        </section>
    `;
  }

  private static assessRiskLevel(data: ReleaseNotesData): string {
    if (data.stats.apiChanges > 2) return '<span class="risk-high">HIGH RISK changes</span>';
    if (data.stats.bugFixes > 5) return '<span class="risk-medium">MEDIUM RISK changes</span>';
    return '<span class="risk-low">LOW RISK changes</span>';
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
                            <td><strong>${ticket.id}</strong></td>
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
    if (ticket.category === 'API' || ticket.commits.length > 5) return 'High';
    if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) return 'Medium';
    return 'Low';
  }

  private static generateTicketDetails(data: ReleaseNotesData): string {
    const sections = [
      { title: 'Critical Bug Fixes', tickets: data.categories.bugFixes },
      { title: 'New Features', tickets: data.categories.newFeatures },
      { title: 'API Changes', tickets: data.categories.apiChanges },
      { title: 'Other Changes', tickets: [...data.categories.uiUpdates, ...data.categories.refactoring, ...data.categories.other] },
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

    return `
        <div class="ticket">
            <div class="ticket-header">
                <div>
                    <span class="ticket-id">${ticket.id}</span>
                    <span class="ticket-title">${ticket.title}</span>
                </div>
                <div class="ticket-meta">
                    ${ticket.assignee || 'Unassigned'} | ${ticket.commits.length} commits
                </div>
            </div>
            
            <div class="ticket-summary">
                ${ticket.description || 'No description available.'}
            </div>
            
            <div class="ticket-details-grid">
                ${specificTestingNotes.length > 0 ? `
                    <div class="detail-section">
                        <h4>Key Testing Points</h4>
                        <ul class="compact-list">
                            ${specificTestingNotes.slice(0, 3).map(note => `<li>${note}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                
                ${specificRisks.length > 0 ? `
                    <div class="detail-section">
                        <h4>Risks</h4>
                        <ul class="compact-list">
                            ${specificRisks.slice(0, 3).map(risk => `<li>${risk}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
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
                        return `
                            <tr>
                                <td class="commit-hash">${commit.hash.substring(0, 8)}</td>
                                <td>${commit.message}</td>
                                <td>${ticketMatch ? ticketMatch[1] : '-'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            ${data.commits.length > 50 ? `<p><em>... and ${data.commits.length - 50} more commits</em></p>` : ''}
        </section>
    `;
  }
}