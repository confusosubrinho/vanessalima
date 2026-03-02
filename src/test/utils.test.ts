import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from '../lib/utils';

describe('serializeJsonLd', () => {
  it('should stringify a simple object', () => {
    const data = { name: 'Test' };
    expect(serializeJsonLd(data)).toBe('{"name":"Test"}');
  });

  it('should escape < to \\u003c to prevent XSS in scripts', () => {
    const data = { script: '<script>alert(1)</script>' };
    const result = serializeJsonLd(data);
    expect(result).not.toContain('<');
    expect(result).toContain('\\u003c');
    expect(result).toBe('{"script":"\\u003cscript>alert(1)\\u003c/script>"}');
  });

  it('should handle complex nested objects', () => {
    const data = {
      "@context": "https://schema.org",
      "itemListElement": [
        { "name": "<b>Escape</b>" }
      ]
    };
    const result = serializeJsonLd(data);
    expect(result).toContain('\\u003cb>Escape\\u003c/b>');
  });
});
