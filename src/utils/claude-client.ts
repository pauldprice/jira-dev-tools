import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import type { CodeDiff } from './git-diff';
import type { LLMFriendlyOutput } from './jira-client';

export interface TicketAnalysis {
  summary: string;
  technicalChanges: string[];
  testingNotes: string[];
  risks: string[];
}

export class ClaudeClient {
  private client: Anthropic;
  protected model: string;
  
  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({
      apiKey,
    });
    
    // Map model aliases to actual model names
    const modelMap: Record<string, string> = {
      'haiku': 'claude-3-haiku-20240307',
      'sonnet': 'claude-3-5-sonnet-20241022',
      'opus': 'claude-3-opus-20240229'
    };
    
    this.model = model ? (modelMap[model] || model) : 'claude-3-5-sonnet-20241022';
  }
  
  /**
   * Analyze code changes and generate a summary
   */
  async analyzeCodeChanges(
    diff: CodeDiff,
    jiraData?: LLMFriendlyOutput
  ): Promise<TicketAnalysis> {
    try {
      const prompt = this.buildAnalysisPrompt(diff, jiraData);
      
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        temperature: 0.3,
        system: `You are a senior software engineer reviewing code changes for a release notes document. Your task is to:
1. Provide a clear, concise summary of what was changed and WHY (2-3 sentences max)
2. List the key technical changes made (specific files, functions, or features modified)
3. Generate SPECIFIC testing notes based on the actual code changes - what exactly should QA test?
4. Identify any potential risks or areas that need careful attention

Rules for testing notes:
- Be specific about WHAT to test based on the code changes
- Include edge cases that relate to the actual changes made
- Mention specific user flows or scenarios to verify
- Reference specific features or components that were modified
- Avoid generic advice like "test edge cases" or "check for regressions"

Example good testing note: "Verify that the new florist ranking dropdown correctly saves and displays the selected order"
Example bad testing note: "Test the feature thoroughly"`,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      
      // Parse the response
      const response = message.content[0].type === 'text' ? message.content[0].text : '';
      return this.parseAnalysisResponse(response, diff);
      
    } catch (error: any) {
      logger.error(`Claude API error: ${error.message}`);
      // Return a basic analysis if AI fails
      return {
        summary: jiraData?.title || `Changes for ticket ${diff.ticketId}`,
        technicalChanges: [`${diff.stats.filesChanged} files changed (+${diff.stats.insertions}, -${diff.stats.deletions})`],
        testingNotes: this.generateFallbackTestingNotes('', diff),
        risks: []
      };
    }
  }
  
  /**
   * Generate a comprehensive ticket summary combining Jira and code analysis
   */
  async generateTicketSummary(
    ticketId: string,
    jiraData: LLMFriendlyOutput,
    codeAnalysis: TicketAnalysis
  ): Promise<string> {
    try {
      const prompt = `Based on the following information, write a clear and concise summary for a release notes document:

JIRA TICKET: ${ticketId}
Title: ${jiraData.title}
Status: ${jiraData.status}
Original Description: ${jiraData.description}

CODE ANALYSIS:
${codeAnalysis.summary}

Technical Changes:
${codeAnalysis.technicalChanges.map(c => `- ${c}`).join('\n')}

Please write a 2-3 sentence summary that:
1. Clearly explains what was done (not just what the problem was)
2. Mentions the key technical approach taken
3. Is suitable for a release notes document

Do not include testing notes or risks in this summary.`;

      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      
      const response = message.content[0].type === 'text' ? message.content[0].text : '';
      return response.trim();
      
    } catch (error: any) {
      logger.error(`Failed to generate summary: ${error.message}`);
      // Fallback to code analysis summary
      return codeAnalysis.summary;
    }
  }
  
  protected buildAnalysisPrompt(diff: CodeDiff, jiraData?: LLMFriendlyOutput): string {
    const parts: string[] = [];
    
    // Add Jira context if available
    if (jiraData) {
      parts.push('JIRA TICKET INFORMATION:');
      parts.push(`Title: ${jiraData.title}`);
      parts.push(`Status: ${jiraData.status}`);
      if (jiraData.description) {
        parts.push(`Description: ${jiraData.description.substring(0, 500)}...`);
      }
      parts.push('');
    }
    
    // Add code diff summary
    parts.push('CODE CHANGES SUMMARY:');
    parts.push(`Files changed: ${diff.stats.filesChanged}`);
    parts.push(`Lines added: ${diff.stats.insertions}`);
    parts.push(`Lines deleted: ${diff.stats.deletions}`);
    parts.push('');
    
    // Add file list
    parts.push('FILES CHANGED:');
    diff.files.forEach(file => {
      const symbol = file.changeType === 'added' ? '+' : 
                     file.changeType === 'deleted' ? '-' : 
                     file.changeType === 'renamed' ? '→' : '~';
      parts.push(`${symbol} ${file.path} (+${file.additions}, -${file.deletions})`);
    });
    parts.push('');
    
    // Add key code changes (limited to avoid token limits)
    const importantDiffs = diff.files
      .filter(f => f.changeType !== 'deleted')
      .filter(f => /\.(ts|tsx|js|jsx)$/.test(f.path))
      .slice(0, 5);
    
    if (importantDiffs.length > 0) {
      parts.push('KEY CODE CHANGES:');
      importantDiffs.forEach(file => {
        parts.push(`\nFile: ${file.path}`);
        parts.push('```diff');
        // Get meaningful parts of the diff
        const diffLines = file.diff.split('\n')
          .filter(line => line.startsWith('+') || line.startsWith('-'))
          .filter(line => !line.match(/^[+-]\s*$/)) // Skip empty lines
          .slice(0, 50); // Limit lines
        parts.push(diffLines.join('\n'));
        parts.push('```');
      });
    }
    
    parts.push('\nPlease analyze these changes and provide:');
    parts.push('1. A clear summary of what was changed and why');
    parts.push('2. List of key technical changes');
    parts.push('3. Specific testing notes based on the code changes');
    parts.push('4. Any risks or concerns');
    
    return parts.join('\n');
  }
  
  private parseAnalysisResponse(response: string, diff: CodeDiff): TicketAnalysis {
    // Default structure
    const analysis: TicketAnalysis = {
      summary: '',
      technicalChanges: [],
      testingNotes: [],
      risks: []
    };
    
    // Try to parse structured response
    const sections = response.split(/\n\n+/);
    
    sections.forEach(section => {
      const lines = section.split('\n').filter(line => line.trim());
      
      if (section.toLowerCase().includes('summary:') || lines[0]?.match(/^(summary|overview)/i)) {
        analysis.summary = lines.slice(1).join(' ').trim() || lines.join(' ').replace(/^.*?:\s*/, '');
      }
      else if (section.toLowerCase().includes('technical change') || section.toLowerCase().includes('key change')) {
        analysis.technicalChanges = lines
          .filter(line => line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/))
          .map(line => line.replace(/^[-•*\d.]\s+/, '').trim())
          .filter(line => !line.match(/^(\d+\.\s*)?(technical changes|key changes|key technical changes):/i))
          .filter(line => !line.match(/^\d+\.\s*[A-Z\s]+:?$/)) // Remove section headers
          .filter(line => !line.match(/^[A-Z\s]+:$/)) // Remove standalone headers
          .filter(line => line.length > 0);
      }
      else if (section.toLowerCase().includes('testing')) {
        analysis.testingNotes = lines
          .filter(line => line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/))
          .map(line => line.replace(/^[-•*\d.]\s+/, '').trim())
          .filter(line => !line.match(/^(\d+\.\s*)?(testing|testing notes|specific testing notes):/i))
          .filter(line => !line.match(/^\d+\.\s*[A-Z\s]+:?$/)) // Remove section headers
          .filter(line => !line.match(/^[A-Z\s]+:$/)) // Remove standalone headers
          .filter(line => line.length > 0);
      }
      else if (section.toLowerCase().includes('risk') || section.toLowerCase().includes('concern')) {
        analysis.risks = lines
          .filter(line => line.match(/^[-•*]\s+/) || line.match(/^\d+\.\s+/))
          .map(line => line.replace(/^[-•*\d.]\s+/, '').trim())
          .filter(line => !line.match(/^(\d+\.\s*)?(risks|concerns|potential risks|risks and concerns):/i))
          .filter(line => !line.match(/^\d+\.\s*[A-Z\s]+:?$/)) // Remove section headers
          .filter(line => !line.match(/^[A-Z\s]+:$/)) // Remove standalone headers
          .filter(line => line.length > 0);
      }
    });
    
    // Fallback if parsing fails
    if (!analysis.summary) {
      analysis.summary = response.split('\n')[0] || 'Code changes implemented';
    }
    
    if (analysis.technicalChanges.length === 0) {
      analysis.technicalChanges = ['Code modifications made as per requirements'];
    }
    
    if (analysis.testingNotes.length === 0) {
      // Generate more specific fallback testing notes based on the changes
      analysis.testingNotes = this.generateFallbackTestingNotes(response, diff);
    }
    
    return analysis;
  }
  
  private generateFallbackTestingNotes(_aiResponse: string, diff: CodeDiff): string[] {
    const notes: string[] = [];
    
    // Analyze file types changed
    const hasUIChanges = diff.files.some(f => 
      f.path.includes('/ui/') || f.path.includes('.tsx') || f.path.includes('.jsx') || f.path.includes('.vue')
    );
    const hasAPIChanges = diff.files.some(f => 
      f.path.includes('/api/') || f.path.includes('/routes/') || f.path.includes('controller')
    );
    const hasDBChanges = diff.files.some(f => 
      f.path.includes('.sql') || f.path.includes('/migration/') || f.path.includes('/database/')
    );
    const hasTestChanges = diff.files.some(f => 
      f.path.includes('.test.') || f.path.includes('.spec.') || f.path.includes('/test/')
    );
    
    // Generate specific notes based on changes
    if (hasUIChanges) {
      notes.push('Test all affected UI components for visual regressions');
      notes.push('Verify user interactions work correctly in the modified screens');
      notes.push('Check responsive behavior on mobile devices');
    }
    
    if (hasAPIChanges) {
      notes.push('Test all modified API endpoints with various payloads');
      notes.push('Verify error handling for invalid requests');
      notes.push('Check backward compatibility for existing integrations');
    }
    
    if (hasDBChanges) {
      notes.push('Verify database migrations run successfully');
      notes.push('Test data integrity after migration');
      notes.push('Check query performance for any new database operations');
    }
    
    if (hasTestChanges) {
      notes.push('Ensure all new and modified tests pass');
      notes.push('Verify test coverage meets requirements');
    }
    
    // Add notes based on file count
    if (diff.stats.filesChanged > 10) {
      notes.push('Perform comprehensive regression testing due to extensive changes');
    }
    
    // If still no notes, add generic ones
    if (notes.length === 0) {
      notes.push('Test the specific functionality mentioned in the ticket');
      notes.push('Verify no existing features are broken');
      notes.push('Check edge cases relevant to the changes');
    }
    
    return notes;
  }

  /**
   * Generate a primary focus summary for the entire release
   */
  async generateReleasePrimaryFocus(
    ticketSummaries: Array<{ id: string; title: string; description?: string; category: string }>
  ): Promise<string> {
    const prompt = `Based on these tickets being released, provide a concise PRIMARY FOCUS for this release (maximum 5-6 words). 

Tickets:
${ticketSummaries.map(t => `- ${t.id} (${t.category}): ${t.title}${t.description ? ' - ' + t.description : ''}`).join('\n')}

Instructions:
- Analyze all tickets to identify the main theme or focus
- Return ONLY the focus phrase (e.g., "User Experience & Performance Improvements")
- Be specific but concise (5-6 words max)
- Focus on what matters most to stakeholders
- Avoid generic terms like "General Maintenance"`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 50,
        temperature: 0.3,
        system: 'You are a technical writer creating concise release summaries. Return only the requested focus phrase, nothing else.',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const focus = message.content[0].type === 'text' ? message.content[0].text.trim() : 'Release Improvements';
      
      // Ensure it's not too long
      const words = focus.split(' ');
      if (words.length > 6) {
        return words.slice(0, 6).join(' ');
      }
      
      return focus;
    } catch (error: any) {
      logger.debug(`Failed to generate release focus: ${error.message}`);
      return 'Release Improvements';
    }
  }
}

// Factory function
export function createClaudeClient(apiKey?: string, model?: string): ClaudeClient | null {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  
  if (!key) {
    logger.warn('No Anthropic API key found. AI features will be disabled.');
    return null;
  }
  
  return new ClaudeClient(key, model);
}