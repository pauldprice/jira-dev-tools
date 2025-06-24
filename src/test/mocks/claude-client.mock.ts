import { ClaudeClient } from '../../utils/claude-client';

export const mockClaudeResponses = {
  analyzeCodeChanges: {
    summary: 'Test summary of code changes',
    keyChanges: ['Added new feature', 'Fixed bug'],
    testingNotes: ['Test the new feature', 'Verify bug is fixed'],
    risks: ['Potential performance impact'],
    category: 'feature',
  },
  generateTicketSummary: 'Enhanced test feature with improved performance',
  generateReleasePrimaryFocus: 'Test-Driven Development & Quality Improvements',
};

export const createMockClaudeClient = (overrides?: Partial<typeof mockClaudeResponses>) => {
  const responses = { ...mockClaudeResponses, ...overrides };
  
  const mockClient = {
    analyzeCodeChanges: jest.fn().mockResolvedValue(responses.analyzeCodeChanges),
    generateTicketSummary: jest.fn().mockResolvedValue(responses.generateTicketSummary),
    generateReleasePrimaryFocus: jest.fn().mockResolvedValue(responses.generateReleasePrimaryFocus),
  } as unknown as ClaudeClient;
  
  return mockClient;
};

// Mock the entire module
jest.mock('../../utils/claude-client', () => ({
  ClaudeClient: jest.fn().mockImplementation(() => createMockClaudeClient()),
  createCachedClaudeClient: jest.fn().mockImplementation((apiKey) => {
    if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
      return null;
    }
    return createMockClaudeClient();
  }),
}));