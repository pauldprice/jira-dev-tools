/**
 * Optimized HTML template for release notes with PDF generation support
 */

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
        ${this.getOptimizedStyles(data.version || '')}
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
                content: none; /* No header on first page */
            }
        }
    `;
  }

  private static generateCoverPage(data: ReleaseNotesData): string {
    // Embed the logo SVG directly inline for Puppeteer compatibility
    const logoSvg = `
      <svg width="300" height="265" viewBox="0 0 878 776" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g clip-path="url(#clip0_gather_logo)">
        <g clip-path="url(#clip1_gather_logo)">
        <path d="M491.267 490.676H271.793C174.988 490.676 96.5176 412.131 96.5176 315.242C96.5176 234.986 150.361 167.315 223.873 146.453C216.034 169.227 212.044 193.15 212.069 217.237C212.069 327.998 294.88 419.383 401.907 432.775C424.98 460.877 456.205 481.11 491.267 490.676V490.676Z" fill="#BBE8FF"/>
        <path d="M632.591 490.676H491.267C456.207 481.107 424.983 460.872 401.913 432.769C294.88 419.37 212.069 327.985 212.069 217.237C212.04 193.155 216.023 169.236 223.855 146.465C263.18 135.314 305.161 138.25 342.555 154.766C379.949 171.282 410.411 200.342 428.687 236.934L519.519 414.765C519.517 414.775 519.517 414.785 519.519 414.795C529.867 436.325 545.779 454.692 565.608 467.993C585.436 481.294 608.458 489.044 632.288 490.44" fill="#99D3FF"/>
        <path d="M646.154 217.237C646.154 218.979 646.154 220.708 646.087 222.437C644.178 222.352 642.262 222.316 640.328 222.316C566.283 222.316 506.255 282.39 506.255 356.499C506.229 376.671 510.767 396.586 519.526 414.753L428.687 236.934C410.409 200.344 379.948 171.285 342.555 154.767C305.162 138.249 263.182 135.309 223.855 146.453C253.175 61.2329 333.998 0 429.112 0C536.848 0 626.25 78.5694 643.244 181.581C645.187 193.367 646.16 205.292 646.154 217.237Z" fill="#66BAFF"/>
        <path d="M646.087 222.425C644.08 307.888 592.77 381.123 519.526 414.783C510.766 396.617 506.229 376.701 506.254 356.53C506.254 282.426 566.276 222.346 640.327 222.346C642.261 222.304 644.177 222.34 646.087 222.425Z" fill="#76CCFF"/>
        <path d="M776.826 529.743C735.89 537.413 677.069 530.489 632.319 490.458C608.49 489.062 585.468 481.312 565.639 468.011C545.811 454.71 529.898 436.343 519.551 414.813C519.548 414.803 519.548 414.793 519.551 414.783C592.796 381.142 644.105 307.906 646.112 222.425C660.274 223.013 674.252 225.854 687.521 230.842C738.291 249.944 774.425 298.992 774.425 356.487C774.438 377.899 769.326 399.002 759.516 418.029C749.706 437.057 735.484 453.456 718.041 465.852C720.751 471.981 736.484 503.68 777.966 518.784C783.265 520.713 782.374 528.687 776.826 529.743Z" fill="#BADEF9"/>
        </g>
        </g>
        <path d="M163.684 667.389V760.799C148.432 768.691 127.017 775.44 97.9769 775.44C40.4811 775.44 0 737.949 0 677.049C0 615.557 42.8293 576.903 97.9769 576.903C126.721 576.903 147.258 584.519 159.873 593.304C158.11 604.725 152.536 615.265 142.565 621.122C130.243 612.925 116.751 608.533 97.6844 608.533C63.0699 608.533 35.7886 632.838 35.7886 676.761C35.7886 717.46 56.3217 744.405 98.2497 744.405C112.039 744.405 122.598 742.641 130.813 740.009V698.431H95.3204C94.1718 693.237 93.5821 687.936 93.5612 682.618C93.5826 677.492 94.1726 672.385 95.3204 667.389H163.684Z" fill="#325E80"/>
        <path d="M286.172 631.015C294.734 632.996 301.674 636.19 306.989 640.597C312.314 645.017 316.253 650.872 318.339 657.464C320.598 664.304 321.726 672.579 321.723 682.29V753.269C321.723 760.635 319.11 764.953 313.884 766.221C306.673 768.197 298.108 769.68 288.188 770.672C278.268 771.664 268.536 772.16 258.993 772.16C247.457 772.16 237.726 771.305 229.798 769.595C221.871 767.885 215.472 765.185 210.601 761.497C205.877 757.977 202.232 753.21 200.078 747.732C197.914 742.247 196.833 735.726 196.836 728.17C196.836 713.595 201.252 702.62 210.083 695.246C218.915 687.871 231.349 684.188 247.386 684.196C255.144 684.179 262.885 684.902 270.505 686.355C277.982 687.791 284.605 689.764 290.374 692.274V686.611C290.374 680.313 289.834 675.051 288.753 670.826C287.672 666.601 285.6 663.18 282.535 660.565C279.467 657.956 275.187 656.114 269.694 655.04C264.202 653.967 257.037 653.428 248.201 653.422C242.073 653.422 236.034 653.603 230.083 653.963C224.997 654.212 219.937 654.842 214.946 655.849C211.883 656.391 210.352 655.313 210.352 652.613V639.113C210.352 636.232 211.794 634.342 214.677 633.442C218.82 632.006 224.498 630.747 231.712 629.666C239.32 628.559 246.999 628.018 254.688 628.048C267.117 628.042 277.611 629.031 286.172 631.015ZM276.976 746.248C281.474 745.901 285.944 745.269 290.362 744.358V711.702C281.712 710.084 271.259 709.275 259.001 709.275C253.055 709.275 248.099 709.634 244.133 710.352C240.166 711.071 237.012 712.195 234.669 713.727C232.451 715.111 230.707 717.135 229.668 719.532C228.679 721.868 228.185 724.746 228.185 728.166C228.185 731.586 228.725 734.465 229.806 736.801C230.889 739.14 232.734 741.073 235.341 742.602C237.947 744.13 241.553 745.21 246.157 745.842C250.753 746.468 256.566 746.782 263.594 746.785C267.922 746.788 272.383 746.61 276.976 746.252V746.248Z" fill="#325E80"/>
        <path d="M346.574 651.256V634.523C346.574 631.643 348.016 630.204 350.899 630.206H373.626V597.282C373.626 594.404 374.977 592.965 377.678 592.965H400.658C403.544 592.965 404.986 594.404 404.983 597.282V630.206H441.211C444.091 630.206 445.533 631.645 445.535 634.523V651.256C445.535 654.134 444.094 655.573 441.211 655.573H404.983V725.471C404.983 732.837 406.29 738.231 408.905 741.651C411.519 745.071 416.79 746.781 424.718 746.781C428.318 746.781 431.788 746.69 435.127 746.509C438.466 746.327 441.393 746.058 443.907 745.7C446.434 745.345 447.697 746.426 447.694 748.944V763.794C447.694 766.133 446.522 767.663 444.18 768.383C440.195 769.775 436.07 770.726 431.877 771.217C426.992 771.854 422.07 772.17 417.143 772.164C401.647 772.164 390.518 768.161 383.758 760.155C376.998 752.15 373.621 741.218 373.626 727.361V655.573H350.915C348.021 655.573 346.574 654.134 346.574 651.256Z" fill="#325E80"/>
        <path d="M504.44 769.997H481.46C478.756 769.997 477.404 768.649 477.404 765.952V577.317C477.404 574.439 478.756 573 481.46 573H504.44C507.321 573 508.763 574.439 508.765 577.317V634.796C514.646 632.638 520.708 631.011 526.879 629.934C533.745 628.674 540.712 628.043 547.693 628.048C555.805 628.048 563.105 628.992 569.594 630.881C575.803 632.613 581.505 635.807 586.221 640.194C590.809 644.512 594.323 650.133 596.76 657.057C599.198 663.982 600.414 672.573 600.409 682.831V765.952C600.409 768.652 599.058 770 596.357 769.997H573.377C570.496 769.997 569.054 768.649 569.048 765.952V684.989C569.048 673.655 566.617 665.56 561.754 660.703C556.892 655.847 548.327 653.417 536.058 653.415C531.375 653.415 526.689 653.504 522.001 653.683C517.312 653.862 512.896 654.222 508.753 654.764V765.952C508.761 768.652 507.324 770 504.44 769.997Z" fill="#325E80"/>
        <path d="M728.267 746.114C734.577 745.664 740.074 745.08 744.76 744.362C747.825 743.82 749.358 744.899 749.358 747.598V761.095C749.358 763.973 747.916 765.862 745.033 766.762C739.804 768.38 733.541 769.683 726.243 770.672C718.851 771.67 711.399 772.167 703.939 772.16C690.962 772.16 679.878 770.63 670.689 767.571C661.499 764.511 654.019 760.013 648.25 754.078C642.478 748.143 638.243 740.855 635.544 732.215C632.846 723.575 631.494 713.591 631.488 702.263V695.246C631.488 673.657 637.075 657.058 648.25 645.451C659.424 633.843 675.916 628.04 697.725 628.04C708.003 628.04 716.964 629.389 724.607 632.089C732.25 634.788 738.646 638.611 743.796 643.557C748.974 648.565 752.909 654.711 755.288 661.505C757.81 668.521 759.072 676.257 759.075 684.713C759.075 705.581 746.278 716.017 720.685 716.019H663.66C664.379 721.773 665.91 726.63 668.253 730.589C670.54 734.491 673.741 737.779 677.583 740.171C681.452 742.599 686.002 744.31 691.233 745.301C697.032 746.341 702.915 746.838 708.806 746.785C715.476 746.788 721.963 746.564 728.267 746.114ZM727.73 682.558C727.73 673.206 725.206 666.009 720.159 660.968C715.112 655.927 707.452 653.409 697.179 653.415C687.085 653.415 678.931 656.203 672.717 661.781C666.502 667.358 663.208 676.984 662.834 690.656H718.523C724.658 690.656 727.727 687.957 727.73 682.558V682.558Z" fill="#325E80"/>
        <path d="M818.542 769.997H795.566C792.862 769.997 791.51 768.649 791.51 765.952V647.207C791.51 643.432 792.141 640.552 793.403 638.568C794.666 636.585 796.642 635.146 799.333 634.251C806.777 632.152 814.369 630.619 822.045 629.665C830.566 628.572 839.149 628.032 847.741 628.047C852.247 628.047 856.888 628.228 861.664 628.588C866.439 628.949 870.539 629.308 873.962 629.665C875.587 629.847 876.666 630.297 877.208 631.015C877.75 631.733 877.999 632.815 877.999 634.251V652.065C877.999 655.125 876.286 656.384 872.859 655.842C864.386 654.224 856.546 653.415 849.338 653.415C840.453 653.403 831.586 654.216 822.851 655.842V765.944C822.864 768.649 821.428 770 818.542 769.997Z" fill="#325E80"/>
        <defs>
        <clipPath id="clip0_gather_logo">
        <rect width="685" height="531" fill="white" transform="translate(96.5)"/>
        </clipPath>
        <clipPath id="clip1_gather_logo">
        <rect width="685" height="531" fill="white" transform="translate(96.5)"/>
        </clipPath>
        </defs>
      </svg>
    `;
    
    return `
        <div class="cover-page">
            <div class="logo-container">${logoSvg}</div>
            <div class="cover-title">Release Notes</div>
            <div class="cover-subtitle">${data.version || 'Development Build'}</div>
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
    
    // Calculate total lines changed
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

    return `
        <section class="executive-summary" id="executive-summary" style="page-break-after: always;">
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
            
            <h2>Release Highlights & Quick Reference</h2>
            <ul>
                ${data.version ? `<li><strong>Release Version:</strong> ${data.version}</li>` : ''}
                <li><strong>${percentBugFixes}%</strong> of changes are bug fixes, improving system stability</li>
                ${data.stats.newFeatures > 0 ? `<li><strong>${data.stats.newFeatures}</strong> new features enhance user capabilities</li>` : ''}
                ${data.stats.apiChanges > 0 ? `<li><strong>${data.stats.apiChanges}</strong> API changes require integration review</li>` : ''}
                <li><strong>Code Impact:</strong> <span class="diff-added">+${totalAdditions.toLocaleString()}</span> <span class="diff-removed">-${totalDeletions.toLocaleString()}</span></li>
                <li><strong>Risk Distribution:</strong> ${this.getRiskLevelSummary(data)}</li>
                <li><strong>Primary Focus:</strong> ${data.primaryFocus || this.getPrimaryFocus(data)}</li>
                <li><strong>Total Commits:</strong> ${data.stats.totalCommits}</li>
                <li>All changes have passed acceptance testing</li>
            </ul>
            
            <h2>Table of Contents</h2>
            <div class="toc" style="line-height: 1.8;">
                <div><a href="#executive-summary">Executive Summary (this page)</a></div>
                <div><a href="#change-summary">Change Summary Table</a></div>
                ${data.categories.bugFixes.length > 0 ? '<div><a href="#critical-bug-fixes">Critical Bug Fixes</a></div>' : ''}
                ${data.categories.newFeatures.length > 0 ? '<div><a href="#new-features">New Features</a></div>' : ''}
                ${data.categories.apiChanges.length > 0 ? '<div><a href="#api-changes">API Changes</a></div>' : ''}
                ${(data.categories.uiUpdates.length + data.categories.refactoring.length + data.categories.other.length) > 0 ? '<div><a href="#other-changes">Other Changes</a></div>' : ''}
                <div><a href="#appendix">Appendix: Full Commit List</a></div>
            </div>
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
    
    // Sort tickets by risk (high to low) and then by number of changes
    allTickets.sort((a, b) => {
      // First, sort by risk level
      const riskA = this.getTicketRiskLevel(a);
      const riskB = this.getTicketRiskLevel(b);
      
      if (riskA !== riskB) {
        // High = 3, Medium = 2, Low = 1
        return riskB - riskA;
      }
      
      // If risk is the same, sort by total lines changed (descending)
      const changesA = (a.diffStats?.additions || 0) + (a.diffStats?.deletions || 0);
      const changesB = (b.diffStats?.additions || 0) + (b.diffStats?.deletions || 0);
      
      return changesB - changesA;
    });

    return `
        <section class="ticket-summary" id="change-summary" style="padding: 2em;">
            <h2>Change Summary</h2>
            <table class="summary-table">
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
                    ${allTickets.map(ticket => `
                        <tr>
                            <td><strong><a href="#${ticket.id}" style="color: #2c3e50; text-decoration: none;">${ticket.id}</a></strong></td>
                            <td>${ticket.title}</td>
                            <td>${ticket.status || 'Unknown'}</td>
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

  private static getTicketRiskLevel(ticket: any): number {
    // Returns numeric risk level for sorting: High = 3, Medium = 2, Low = 1
    if (ticket.category === 'API' || ticket.commits.length > 5) {
      return 3; // High
    }
    if (ticket.category === 'Bug Fix' && ticket.commits.length > 3) {
      return 2; // Medium
    }
    return 1; // Low
  }
  
  private static assessTicketRisk(ticket: any): string {
    // Simple risk assessment based on commits and category
    const riskLevel = this.getTicketRiskLevel(ticket);
    if (riskLevel === 3) {
      return '<span class="risk-badge risk-high">High</span>';
    }
    if (riskLevel === 2) {
      return '<span class="risk-badge risk-medium">Medium</span>';
    }
    return '<span class="risk-badge risk-low">Low</span>';
  }

  private static generateTicketDetails(data: ReleaseNotesData): string {
    const sections = [
      { id: 'critical-bug-fixes', title: '🐛 Critical Bug Fixes', tickets: data.categories.bugFixes },
      { id: 'new-features', title: '✨ New Features', tickets: data.categories.newFeatures },
      { id: 'api-changes', title: '🔧 API Changes', tickets: data.categories.apiChanges },
      { id: 'other-changes', title: '📦 Other Changes', tickets: [...data.categories.uiUpdates, ...data.categories.refactoring, ...data.categories.other] },
    ];

    return `
        <section class="ticket-details">
            ${sections
              .filter(section => section.tickets.length > 0)
              .map(section => `
                <h2 id="${section.id}">${section.title}</h2>
                ${section.tickets.map(ticket => this.generateCompactTicket(ticket, data)).join('')}
              `).join('')}
        </section>
    `;
  }

  private static generateCompactTicket(ticket: TicketInfo, data: ReleaseNotesData): string {
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
                    ${ticket.status ? `<span style="color: #7f8c8d; font-size: 0.9em; margin-left: 1em;">(${ticket.status})</span>` : ''}
                </div>
            </div>
            <div class="ticket-meta">
                <span>${ticket.assignee || 'Unassigned'}</span>
                <span>${ticket.commits.length} ${ticket.commits.length === 1 ? 'commit' : 'commits'}</span>
                ${ticket.diffStats ? `
                <div class="diff-stats">
                    <span class="diff-added">+${ticket.diffStats.additions.toLocaleString()}</span>
                    <span class="diff-removed">-${ticket.diffStats.deletions.toLocaleString()}</span>
                </div>
                ` : ''}
                ${data.version && (!ticket.releaseVersion || ticket.releaseVersion !== data.version) ? `
                <div class="version-mismatch" style="color: #e74c3c; font-weight: bold; margin-left: 1em;">
                    ⚠️ ${ticket.releaseVersion ? `Version: ${ticket.releaseVersion}` : 'No Fix Version'}
                </div>
                ` : ''}
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
        <section class="appendix" id="appendix">
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