import { describe, it, expect } from '@jest/globals';

describe('Markdown List Rendering', () => {
  // Test the formatChatContent function
  function formatChatContent(content: string): string {
    // First, handle lists by converting them to temporary placeholders
    let processedContent = content;
    
    // Handle ordered lists (1. 2. 3. etc)
    processedContent = processedContent.replace(/^(\d+)\.\s+(.*$)/gm, '<oli>$2</oli>');
    
    // Handle unordered lists (- or * at start of line)
    processedContent = processedContent.replace(/^[-*]\s+(.*$)/gm, '<uli>$2</uli>');
    
    // Wrap consecutive ordered list items
    processedContent = processedContent.replace(/(<oli>.*?<\/oli>)(\s*<oli>.*?<\/oli>)*/gs, function(match) {
      const items = match.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>');
      return '<ol>' + items + '</ol>';
    });
    
    // Wrap consecutive unordered list items
    processedContent = processedContent.replace(/(<uli>.*?<\/uli>)(\s*<uli>.*?<\/uli>)*/gs, function(match) {
      const items = match.replace(/<uli>/g, '<li>').replace(/<\/uli>/g, '</li>');
      return '<ul>' + items + '</ul>';
    });
    
    // Now apply other formatting
    const formatted = processedContent
      // Convert headers with standard article spacing
      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')
      // Bold and italic (be careful not to match * in lists)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>')
      // Inline code
      .replace(/`(.*?)`/g, '<code>$1</code>')
      // Convert double line breaks to paragraphs, but preserve lists
      .replace(/\n\n+/g, '</p><p>')
      // Single line breaks to spaces, but not within lists
      .replace(/(?<!<\/li>)\n(?!<li>)/g, ' ');

    // Wrap in paragraphs if not already structured
    let finalFormatted = formatted;
    if (!finalFormatted.includes('<p>') && !finalFormatted.includes('<h') && !finalFormatted.includes('<ul>')) {
      finalFormatted = '<p>' + finalFormatted + '</p>';
    } else if (finalFormatted.includes('</p><p>')) {
      finalFormatted = '<p>' + finalFormatted + '</p>';
    }

    return '<div class="chat-article">' + finalFormatted + '</div>';
  }

  it('should render ordered lists correctly', () => {
    const input = '1. First item\n2. Second item\n3. Third item';
    const result = formatChatContent(input);
    
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>First item</li>');
    expect(result).toContain('<li>Second item</li>');
    expect(result).toContain('<li>Third item</li>');
    expect(result).toContain('</ol>');
  });

  it('should render unordered lists with dashes correctly', () => {
    const input = '- First item\n- Second item\n- Third item';
    const result = formatChatContent(input);
    
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>First item</li>');
    expect(result).toContain('<li>Second item</li>');
    expect(result).toContain('<li>Third item</li>');
    expect(result).toContain('</ul>');
  });

  it('should render unordered lists with asterisks correctly', () => {
    const input = '* First item\n* Second item\n* Third item';
    const result = formatChatContent(input);
    
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>First item</li>');
    expect(result).toContain('<li>Second item</li>');
    expect(result).toContain('<li>Third item</li>');
    expect(result).toContain('</ul>');
  });

  it('should handle mixed content with lists', () => {
    const input = 'Here is a list:\n\n1. First item\n2. Second item\n\nAnd some more text.';
    const result = formatChatContent(input);
    
    expect(result).toContain('<p>Here is a list:</p>');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>First item</li>');
    expect(result).toContain('<li>Second item</li>');
    expect(result).toContain('</ol>');
    expect(result).toContain('<p>And some more text.</p>');
  });

  it('should handle headers correctly', () => {
    const input = '# Main Header\n## Subheader\n### Small Header';
    const result = formatChatContent(input);
    
    expect(result).toContain('<h2>Main Header</h2>');
    expect(result).toContain('<h3>Subheader</h3>');
    expect(result).toContain('<h4>Small Header</h4>');
  });

  it('should handle bold and italic text', () => {
    const input = 'This is **bold** and this is *italic*';
    const result = formatChatContent(input);
    
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  it('should handle inline code', () => {
    const input = 'Use the `formatChatContent` function';
    const result = formatChatContent(input);
    
    expect(result).toContain('<code>formatChatContent</code>');
  });

  it('should wrap content in chat-article div', () => {
    const input = 'Simple text';
    const result = formatChatContent(input);
    
    expect(result).toMatch(/^<div class="chat-article">/);
    expect(result).toMatch(/<\/div>$/);
  });
});