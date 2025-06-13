import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReactHtmlGenerator, ReleaseNotesData, TicketInfo } from '../react-html-generator';

describe('ReactHtmlGenerator Components', () => {
  const mockReleaseData: ReleaseNotesData = {
    title: 'Release Notes - V17.02.00',
    date: 'January 15, 2025',
    version: 'V17.02.00',
    branch: {
      source: 'origin/test',
      target: 'origin/master',
    },
    stats: {
      totalCommits: 10,
      totalTickets: 3,
      bugFixes: 1,
      newFeatures: 1,
      uiUpdates: 1,
      apiChanges: 0,
      refactoring: 0,
      other: 0,
    },
    categories: {
      bugFixes: [
        {
          id: 'APP-1234',
          title: 'Fix login issue',
          status: 'Done',
          assignee: 'John Doe',
          description: 'Fixed critical login bug',
          commits: [
            {
              hash: 'abc123',
              author: 'John Doe',
              message: 'APP-1234 Fix login validation',
              date: '2025-01-10T10:00:00Z',
            },
          ],
          testingNotes: ['Test login with invalid credentials'],
          risks: ['May affect SSO integration'],
          diffStats: {
            additions: 50,
            deletions: 20,
          },
        },
      ],
      newFeatures: [
        {
          id: 'APP-2345',
          title: 'Add export functionality',
          status: 'Done',
          assignee: 'Jane Smith',
          description: 'Added CSV export feature',
          commits: [
            {
              hash: 'def456',
              author: 'Jane Smith',
              message: 'APP-2345 Implement CSV export',
              date: '2025-01-12T14:00:00Z',
            },
          ],
          pullRequests: [
            {
              id: 123,
              title: 'APP-2345 Add export functionality',
              state: 'MERGED',
              url: 'https://bitbucket.org/workspace/repo/pull-requests/123',
              author: 'Jane Smith',
              approvalStatus: {
                approved: 2,
                total: 2,
              },
            },
          ],
        },
      ],
      uiUpdates: [],
      apiChanges: [],
      refactoring: [],
      other: [],
    },
    testingGuidelines: ['Run all unit tests', 'Perform smoke testing'],
    commits: [],
    primaryFocus: 'Bug Fixes and Export Features',
    jiraBaseUrl: 'https://jira.example.com',
    repoUrl: 'https://bitbucket.org/workspace/repo.git',
  };

  describe('HTML Generation', () => {
    it('should generate valid HTML with DOCTYPE', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      
      expect(html).toMatch(/^<!DOCTYPE html>/);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('should include all major sections', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      
      expect(html).toContain('Release Notes');
      expect(html).toContain('Executive Summary');
      expect(html).toContain('Change Summary');
      expect(html).toContain('Critical Bug Fixes');
      expect(html).toContain('New Features');
    });

    it('should properly escape HTML in content', () => {
      const dataWithHtml: ReleaseNotesData = {
        ...mockReleaseData,
        categories: {
          ...mockReleaseData.categories,
          bugFixes: [{
            ...mockReleaseData.categories.bugFixes[0],
            description: 'Fixed <script>alert("XSS")</script> issue',
          }],
        },
      };
      
      const html = ReactHtmlGenerator.generateReleaseNotes(dataWithHtml);
      
      expect(html).not.toContain('<script>alert("XSS")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });
  });

  describe('Component Rendering', () => {
    it('should render cover page with correct information', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      
      const coverPage = container.querySelector('.cover-page');
      expect(coverPage).toBeInTheDocument();
      expect(coverPage).toHaveTextContent('V17.02.00');
      expect(coverPage).toHaveTextContent('January 15, 2025');
      
      document.body.removeChild(container);
    });

    it('should render executive summary with statistics', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      
      const summary = container.querySelector('.executive-summary');
      expect(summary).toBeInTheDocument();
      expect(summary).toHaveTextContent('3'); // Total tickets
      expect(summary).toHaveTextContent('1'); // Bug fixes
      expect(summary).toHaveTextContent('1'); // New features
      
      document.body.removeChild(container);
    });

    it('should render ticket details with all information', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      
      const ticket = container.querySelector('#APP-1234');
      expect(ticket).toBeInTheDocument();
      expect(ticket).toHaveTextContent('Fix login issue');
      expect(ticket).toHaveTextContent('John Doe');
      expect(ticket).toHaveTextContent('+50');
      expect(ticket).toHaveTextContent('-20');
      
      document.body.removeChild(container);
    });

    it('should conditionally render PR descriptions', () => {
      const dataWithPrDesc: ReleaseNotesData = {
        ...mockReleaseData,
        includePrDescriptions: true,
        categories: {
          ...mockReleaseData.categories,
          newFeatures: [{
            ...mockReleaseData.categories.newFeatures[0],
            pullRequests: [{
              ...mockReleaseData.categories.newFeatures[0].pullRequests![0],
              description: 'This PR adds CSV export functionality',
            }],
          }],
        },
      };
      
      const html = ReactHtmlGenerator.generateReleaseNotes(dataWithPrDesc);
      expect(html).toContain('This PR adds CSV export functionality');
      
      // Without flag
      const htmlWithoutDesc = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      expect(htmlWithoutDesc).not.toContain('This PR adds CSV export functionality');
    });
  });

  describe('Risk Assessment', () => {
    it('should properly categorize risk levels', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container);
      
      const riskBadges = container.querySelectorAll('.risk-badge');
      expect(riskBadges.length).toBeGreaterThan(0);
      
      // Should have at least one risk badge for our test data
      const lowRiskBadge = Array.from(riskBadges).find(badge => 
        badge.classList.contains('risk-low')
      );
      expect(lowRiskBadge).toBeInTheDocument();
      
      document.body.removeChild(container);
    });
  });

  describe('Date Formatting', () => {
    it('should format dates in compact format', () => {
      const html = ReactHtmlGenerator.generateReleaseNotes(mockReleaseData);
      
      // Should format date as "JAN 10-25" style
      expect(html).toMatch(/[A-Z]{3} \d{2}-\d{2}/);
    });
  });
});