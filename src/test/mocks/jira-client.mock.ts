export const mockJiraTicket = {
  key: 'APP-1234',
  fields: {
    summary: 'Test ticket summary',
    description: 'Test ticket description',
    status: { name: 'Done' },
    assignee: { displayName: 'John Doe' },
    issuetype: { name: 'Story' },
    fixVersions: [{ name: 'V17.02.00' }],
    comment: {
      comments: [
        {
          author: { displayName: 'Jane Smith' },
          body: 'Test comment',
          created: '2025-01-01T10:00:00.000Z',
        },
      ],
    },
  },
};

export const mockJiraSearchResults = {
  issues: [mockJiraTicket],
  total: 1,
  maxResults: 50,
  startAt: 0,
};

export const mockFetchJiraTicket = jest.fn().mockResolvedValue({
  title: mockJiraTicket.fields.summary,
  description: mockJiraTicket.fields.description,
  status: mockJiraTicket.fields.status.name,
  assignee: mockJiraTicket.fields.assignee?.displayName,
  issueType: mockJiraTicket.fields.issuetype.name,
  fixVersions: mockJiraTicket.fields.fixVersions.map(v => v.name),
  comments: mockJiraTicket.fields.comment.comments.map(c => ({
    author: c.author.displayName,
    body: c.body,
    created: c.created,
  })),
});

export const mockSearchJiraTickets = jest.fn().mockResolvedValue([mockJiraTicket]);

// Mock the cached version
jest.mock('../../utils/cached-jira', () => ({
  fetchJiraTicketCached: mockFetchJiraTicket,
  searchJiraTickets: mockSearchJiraTickets,
}));