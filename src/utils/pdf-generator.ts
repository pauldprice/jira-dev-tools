import puppeteer from 'puppeteer';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

export interface PDFOptions {
  format?: 'A4' | 'Letter';
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  printBackground?: boolean;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export class PDFGenerator {
  static async generateFromHTML(
    htmlPath: string,
    pdfPath?: string,
    options?: PDFOptions
  ): Promise<string> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Read HTML content
      const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      
      // Load HTML with file:// protocol to ensure CSS and assets load correctly
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });
      
      // Set viewport for better rendering
      await page.setViewport({ width: 1200, height: 800 });
      
      // Generate output path if not provided
      if (!pdfPath) {
        const htmlDir = path.dirname(htmlPath);
        const htmlBase = path.basename(htmlPath, '.html');
        pdfPath = path.join(htmlDir, `${htmlBase}.pdf`);
      }
      
      // Default PDF options
      const pdfOptions = {
        path: pdfPath,
        format: 'A4' as const,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size: 9pt; color: #7f8c8d; width: 100%; text-align: center; margin-top: 10px;">Release Notes - ' + new Date().toLocaleDateString() + '</div>',
        footerTemplate: '<div style="font-size: 9pt; color: #7f8c8d; width: 100%; text-align: center; margin-bottom: 10px;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: {
          top: '80px',
          right: '60px',
          bottom: '80px',
          left: '60px'
        },
        preferCSSPageSize: true,
        ...options
      };
      
      // Generate PDF
      await page.pdf(pdfOptions);
      
      logger.success(`PDF generated: ${pdfPath}`);
      
      return pdfPath;
    } catch (error: any) {
      logger.error(`Failed to generate PDF: ${error.message}`);
      throw error;
    } finally {
      await browser.close();
    }
  }
}