/**
 * Utilities for converting Jira's complex document format to readable text/markdown
 */

interface JiraDocNode {
  type: string;
  text?: string;
  content?: JiraDocNode[];
  attrs?: Record<string, any>;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

export class JiraFormatter {
  /**
   * Convert Jira's document format to markdown
   */
  static documentToMarkdown(doc: any): string {
    if (!doc) return '';
    
    // Handle string content
    if (typeof doc === 'string') return doc;
    
    // Handle Jira document format
    if (doc.type === 'doc' && Array.isArray(doc.content)) {
      return doc.content.map((node: JiraDocNode) => this.nodeToMarkdown(node)).join('\n\n');
    }
    
    return JSON.stringify(doc, null, 2);
  }

  private static nodeToMarkdown(node: JiraDocNode, depth: number = 0): string {
    switch (node.type) {
      case 'paragraph':
        return this.processInlineContent(node.content || []);
      
      case 'heading':
        const level = node.attrs?.level || 1;
        const prefix = '#'.repeat(level) + ' ';
        return prefix + this.processInlineContent(node.content || []);
      
      case 'bulletList':
        return (node.content || [])
          .map(item => this.nodeToMarkdown(item, depth))
          .join('\n');
      
      case 'orderedList':
        const start = node.attrs?.order || 1;
        return (node.content || [])
          .map((item, i) => {
            const content = this.nodeToMarkdown(item, depth);
            return content.replace(/^/, `${start + i}. `);
          })
          .join('\n');
      
      case 'listItem':
        const bullet = depth === 0 ? '- ' : '  '.repeat(depth) + '- ';
        return (node.content || [])
          .map(child => {
            const content = this.nodeToMarkdown(child, depth + 1);
            return child.type === 'paragraph' ? bullet + content : content;
          })
          .join('\n');
      
      case 'codeBlock':
        const lang = node.attrs?.language || '';
        const code = this.processInlineContent(node.content || []);
        return '```' + lang + '\n' + code + '\n```';
      
      case 'blockquote':
        return (node.content || [])
          .map(child => '> ' + this.nodeToMarkdown(child, depth))
          .join('\n');
      
      case 'mediaSingle':
      case 'media':
        const mediaAttrs = node.type === 'media' ? node.attrs : node.content?.[0]?.attrs;
        if (mediaAttrs) {
          const alt = mediaAttrs.alt || 'attachment';
          const id = mediaAttrs.id;
          return `![${alt}](attachment:${id})`;
        }
        return '[Media]';
      
      case 'mediaInline':
        const inlineAlt = node.attrs?.alt || 'file';
        const inlineId = node.attrs?.id;
        return `[${inlineAlt}](attachment:${inlineId})`;
      
      case 'inlineCard':
        const url = node.attrs?.url;
        return url ? `[${url}](${url})` : '[Card]';
      
      case 'hardBreak':
        return '\n';
      
      case 'rule':
        return '---';
      
      default:
        // For unknown types, process children if any
        if (node.content) {
          return this.processInlineContent(node.content);
        }
        return node.text || '';
    }
  }

  private static processInlineContent(nodes: JiraDocNode[]): string {
    return nodes.map(node => {
      let text = node.text || '';
      
      // Apply marks (bold, italic, etc.)
      if (node.marks) {
        node.marks.forEach(mark => {
          switch (mark.type) {
            case 'strong':
              text = `**${text}**`;
              break;
            case 'em':
              text = `*${text}*`;
              break;
            case 'code':
              text = `\`${text}\``;
              break;
            case 'strike':
              text = `~~${text}~~`;
              break;
            case 'link':
              const href = mark.attrs?.href || '#';
              text = `[${text}](${href})`;
              break;
          }
        });
      }
      
      // Handle nested content
      if (node.content) {
        text += this.processInlineContent(node.content);
      }
      
      // Handle special node types
      if (node.type && node.type !== 'text') {
        return this.nodeToMarkdown(node);
      }
      
      return text;
    }).join('');
  }

  /**
   * Format a user for display
   */
  static formatUser(user: any): string {
    return user?.displayName || user?.emailAddress || user?.accountId || 'Unknown User';
  }

  /**
   * Format a date for display
   */
  static formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  }

  /**
   * Convert changelog field value to readable text
   */
  static formatFieldValue(field: string, value: any): string {
    if (value === null || value === undefined) return 'None';
    
    switch (field) {
      case 'status':
        return value.name || value.toString();
      case 'assignee':
      case 'reporter':
        return this.formatUser(value);
      case 'priority':
        return value.name || value.toString();
      case 'labels':
        return Array.isArray(value) ? value.join(', ') : value.toString();
      default:
        if (typeof value === 'object' && value.name) {
          return value.name;
        }
        return value.toString();
    }
  }
}