import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../lib/sanitizeHtml';

describe('sanitizeHtml', () => {
  it('should return empty string for non-string inputs', () => {
    // @ts-expect-error testing invalid input
    expect(sanitizeHtml(null)).toBe('');
    // @ts-expect-error testing invalid input
    expect(sanitizeHtml(undefined)).toBe('');
    // @ts-expect-error testing invalid input
    expect(sanitizeHtml(123)).toBe('');
  });

  it('should return empty string for empty or whitespace-only strings', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml('   ')).toBe('');
    expect(sanitizeHtml('\n\t')).toBe('');
  });

  it('should allow safe tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('should allow headings and lists', () => {
    const input = '<h1>Title</h1><ul><li>Item 1</li><li>Item 2</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('should allow safe attributes', () => {
    const input = '<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="link">Link</a>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('should allow images with src and alt', () => {
    const input = '<img src="image.jpg" alt="Description">';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('should strip unsafe tags like script, iframe, object', () => {
    const input = '<p>Safe</p><script>alert("xss")</script><iframe src="example.com"></iframe><object data="test.swf"></object>';
    expect(sanitizeHtml(input)).toBe('<p>Safe</p>');
  });

  it('should strip unsafe attributes like onclick, onmouseover', () => {
    const input = '<a href="https://example.com" onclick="alert(1)" onmouseover="alert(2)">Link</a>';
    expect(sanitizeHtml(input)).toBe('<a href="https://example.com">Link</a>');
  });

  it('should prevent javascript: URIs', () => {
    const input = '<a href="javascript:alert(1)">Click me</a>';
    // DOMPurify removes the href if it's a javascript: URI, leaving an empty <a> tag
    expect(sanitizeHtml(input)).toBe('<a>Click me</a>');
  });
});
