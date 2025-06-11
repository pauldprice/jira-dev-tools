#!/usr/bin/env node
import { Command } from 'commander';
import { FileSystem, logger } from '../utils';
import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const program = new Command();

interface AnalysisOptions {
  output?: string;
  prompt?: string;
  verbose?: boolean;
  model?: string;
  json?: boolean;
  focus?: string;
}

program
  .name('analyze-pdf')
  .description('Analyze PDF files using Claude\'s visual understanding capabilities')
  .argument('<pdf-file>', 'Path to the PDF file to analyze')
  .option('-o, --output <file>', 'Output analysis to a file')
  .option('-p, --prompt <text>', 'Custom analysis prompt', 'Analyze this PDF and provide a comprehensive review of its layout, formatting, readability, and any visual issues.')
  .option('-m, --model <model>', 'Claude model to use (haiku, sonnet, opus)', 'sonnet')
  .option('-j, --json', 'Output analysis in JSON format')
  .option('-f, --focus <area>', 'Focus area: layout, readability, formatting, accessibility, all', 'all')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (pdfFile: string, options: AnalysisOptions) => {
    try {
      // Validate PDF file exists
      const pdfPath = path.resolve(pdfFile);
      if (!fs.existsSync(pdfPath)) {
        logger.error(`PDF file not found: ${pdfPath}`);
        process.exit(1);
      }

      // Check file size (32MB limit)
      const stats = fs.statSync(pdfPath);
      const fileSizeMB = stats.size / (1024 * 1024);
      if (fileSizeMB > 32) {
        logger.error(`PDF file too large: ${fileSizeMB.toFixed(2)}MB (max 32MB)`);
        process.exit(1);
      }

      logger.info(`Analyzing PDF: ${path.basename(pdfPath)}`);
      logger.info(`File size: ${fileSizeMB.toFixed(2)}MB`);

      // Initialize Claude client directly (PDF support might not be in cached client yet)
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        logger.error('Claude API key not configured. Set ANTHROPIC_API_KEY environment variable.');
        process.exit(1);
      }

      const anthropic = new Anthropic({
        apiKey: apiKey
      });

      // Read PDF as base64
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString('base64');

      // Build analysis prompt based on focus area
      let analysisPrompt = options.prompt || '';
      
      if (options.focus && options.focus !== 'all') {
        analysisPrompt = buildFocusedPrompt(options.focus);
      } else if (!options.prompt) {
        analysisPrompt = buildComprehensivePrompt();
      }

      if (options.verbose) {
        logger.info(`Using prompt: ${analysisPrompt.substring(0, 100)}...`);
      }

      // Call Claude API with PDF support
      logger.info('Sending PDF to Claude for analysis...');
      
      try {
        // Use the messages API with PDF support
        const response = await anthropic.messages.create({
          model: options.model === 'haiku' ? 'claude-3-haiku-20240307' : 
                 options.model === 'opus' ? 'claude-3-opus-20240229' : 
                 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          temperature: 0.3,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64
                }
              },
              {
                type: 'text',
                text: analysisPrompt
              }
            ]
          }]
        } as any);

        const analysis = response.content[0].type === 'text' ? response.content[0].text : '';

        // Process and format the analysis
        let output = analysis;
        
        if (options.json) {
          // Try to extract structured data from the analysis
          output = formatAsJSON(analysis);
        }

        // Output results
        if (options.output) {
          await FileSystem.writeFile(options.output, output);
          logger.success(`Analysis saved to: ${options.output}`);
        } else {
          console.log('\n' + output);
        }

      } catch (error: any) {
        logger.error(`Claude API error: ${error.message}`);
        if (error.message.includes('file format')) {
          logger.info('Ensure the PDF is not encrypted or password-protected.');
        }
        process.exit(1);
      }

    } catch (error: any) {
      logger.error(`Failed to analyze PDF: ${error.message}`);
      if (options.verbose) {
        console.error(error);
      }
      process.exit(1);
    }
  });

function buildFocusedPrompt(focus: string): string {
  const prompts: Record<string, string> = {
    layout: `Analyze the PDF layout and structure:
- Page organization and flow
- Section hierarchy and headers
- Visual balance and white space usage
- Consistency across pages
- Any layout issues or improvements needed`,
    
    readability: `Analyze the PDF readability:
- Font sizes and type choices
- Line spacing and paragraph formatting
- Text contrast and legibility
- Information density
- Reading flow and eye movement patterns
- Suggestions for improving readability`,
    
    formatting: `Analyze the PDF formatting:
- Consistency of styles and formatting
- Table and list formatting
- Code block or technical content presentation
- Use of colors and visual elements
- Professional appearance
- Any formatting errors or inconsistencies`,
    
    accessibility: `Analyze the PDF accessibility:
- Text size and contrast for vision impairment
- Color usage and color-blind considerations
- Document structure for screen readers
- Alternative text for images
- Overall accessibility compliance`
  };

  return prompts[focus] || prompts.layout;
}

function buildComprehensivePrompt(): string {
  return `Please provide a comprehensive analysis of this PDF document focusing on:

1. **Overall Impression**
   - Professional appearance and quality
   - First impressions and visual appeal
   - Target audience appropriateness

2. **Layout & Structure**
   - Page organization and flow
   - Section hierarchy and navigation
   - Use of white space and margins
   - Consistency across pages

3. **Typography & Readability**
   - Font choices and sizes
   - Line spacing and paragraph formatting
   - Text contrast and legibility
   - Information density

4. **Visual Elements**
   - Tables and data presentation
   - Use of colors and branding
   - Charts, diagrams, or images
   - Visual hierarchy

5. **Content Organization**
   - Logical flow of information
   - Section breaks and transitions
   - Executive summary effectiveness
   - Appendix and supporting material

6. **Technical Quality**
   - Page breaks and content splitting
   - Header/footer consistency
   - Page numbering
   - Print quality considerations

7. **Specific Issues Found**
   - Any formatting errors
   - Content truncation or overflow
   - Inconsistencies
   - Missing elements

8. **Recommendations**
   - Top 5 improvements to make
   - Quick wins vs major changes
   - Priority order for fixes

Please be specific and provide concrete examples from the document.`;
}

function formatAsJSON(analysis: string): string {
  // Attempt to structure the analysis into JSON format
  const sections = analysis.split(/\n\*\*/).filter(s => s.trim());
  const structured: any = {
    timestamp: new Date().toISOString(),
    analysis: {}
  };

  sections.forEach(section => {
    const lines = section.split('\n');
    const title = lines[0].replace(/\*\*/g, '').replace(/:$/, '').trim();
    const content = lines.slice(1).join('\n').trim();
    
    if (title && content) {
      structured.analysis[title.toLowerCase().replace(/\s+/g, '_')] = content;
    }
  });

  return JSON.stringify(structured, null, 2);
}

// Add help examples
program.addHelpText('after', `
Examples:
  $ toolbox analyze-pdf release_notes.pdf
  $ toolbox analyze-pdf report.pdf --focus readability
  $ toolbox analyze-pdf document.pdf --output analysis.txt
  $ toolbox analyze-pdf report.pdf --json --output analysis.json
  $ toolbox analyze-pdf manual.pdf --prompt "Check for accessibility issues"
`);

program.parse();