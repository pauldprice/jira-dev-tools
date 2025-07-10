import { PromptPlaceholder } from './types';

export interface ParsedPlaceholder {
  name: string;
  default?: string;
  isOptional: boolean;
  choices?: string[];
  raw: string;
}

export class PlaceholderParser {
  /**
   * Parse placeholders from a prompt string
   * Supports formats:
   * - ${variable}
   * - ${variable:default}
   * - ${variable?:default} (optional)
   * - ${choice:option1|option2|option3}
   */
  static parse(prompt: string): Record<string, PromptPlaceholder> {
    const placeholders: Record<string, PromptPlaceholder> = {};
    
    // Match all placeholder patterns
    const regex = /\$\{([^}]+)\}/g;
    let match;
    
    while ((match = regex.exec(prompt)) !== null) {
      const parsed = this.parsePlaceholderContent(match[1]);
      
      // Special handling for context placeholder
      if (parsed.name === 'context') {
        placeholders[parsed.name] = {
          type: 'context',
          required: !parsed.isOptional,
          description: 'Main context/input for the prompt'
        };
      } else if (parsed.choices) {
        placeholders[parsed.name] = {
          type: 'choice',
          choices: parsed.choices,
          default: parsed.default || parsed.choices[0],
          required: !parsed.isOptional
        };
      } else {
        placeholders[parsed.name] = {
          type: 'string',
          default: parsed.default,
          required: !parsed.isOptional
        };
      }
    }
    
    return placeholders;
  }

  private static parsePlaceholderContent(content: string): ParsedPlaceholder {
    // Check if optional (ends with ?)
    const isOptional = content.includes('?');
    
    // Remove optional marker for parsing
    const cleanContent = content.replace('?', '');
    
    // Split by colon to get name and default/choices
    const colonIndex = cleanContent.indexOf(':');
    
    if (colonIndex === -1) {
      // No default value
      return {
        name: cleanContent.trim(),
        isOptional,
        raw: content
      };
    }
    
    const name = cleanContent.substring(0, colonIndex).trim();
    const valuesPart = cleanContent.substring(colonIndex + 1).trim();
    
    // Check if it's a choice placeholder (contains |)
    if (valuesPart.includes('|')) {
      const choices = valuesPart.split('|').map(c => c.trim());
      return {
        name,
        choices,
        default: choices[0],
        isOptional,
        raw: content
      };
    }
    
    // Regular default value
    return {
      name,
      default: valuesPart,
      isOptional,
      raw: content
    };
  }

  /**
   * Substitute placeholders in a prompt with provided values
   */
  static substitute(
    prompt: string,
    values: Record<string, string>,
    placeholders: Record<string, PromptPlaceholder>
  ): string {
    let result = prompt;
    
    // Replace all placeholders
    const regex = /\$\{([^}]+)\}/g;
    
    result = prompt.replace(regex, (_match, content) => {
      const parsed = this.parsePlaceholderContent(content);
      const placeholder = placeholders[parsed.name];
      
      // Get the value
      let value = values[parsed.name];
      
      // Use default if no value provided
      if (!value && placeholder?.default) {
        value = placeholder.default;
      }
      
      // Handle missing required values
      if (!value && placeholder?.required !== false) {
        throw new Error(`Missing required value for placeholder: ${parsed.name}`);
      }
      
      // Return empty string for optional missing values
      if (!value) {
        return '';
      }
      
      return value;
    });
    
    return result;
  }

  /**
   * Validate provided values against placeholders
   */
  static validate(
    values: Record<string, string>,
    placeholders: Record<string, PromptPlaceholder>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check required placeholders
    for (const [name, placeholder] of Object.entries(placeholders)) {
      if (placeholder.required !== false && !values[name] && !placeholder.default) {
        errors.push(`Missing required value for: ${name}`);
      }
      
      // Validate choice placeholders
      if (placeholder.type === 'choice' && values[name]) {
        if (!placeholder.choices?.includes(values[name])) {
          errors.push(
            `Invalid value for ${name}. Must be one of: ${placeholder.choices?.join(', ')}`
          );
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract placeholder names from a prompt
   */
  static extractNames(prompt: string): string[] {
    const names: string[] = [];
    const regex = /\$\{([^}]+)\}/g;
    let match;
    
    while ((match = regex.exec(prompt)) !== null) {
      const parsed = this.parsePlaceholderContent(match[1]);
      if (!names.includes(parsed.name)) {
        names.push(parsed.name);
      }
    }
    
    return names;
  }
}