import { describe, it, expect } from 'vitest';
import { formatCPF } from '../lib/validators';

describe('formatCPF', () => {
  it('should format an empty string correctly', () => {
    expect(formatCPF('')).toBe('');
  });

  it('should format a string with 3 or fewer digits without periods or hyphens', () => {
    expect(formatCPF('12')).toBe('12');
    expect(formatCPF('123')).toBe('123');
  });

  it('should format a string with 4 to 6 digits adding one period', () => {
    expect(formatCPF('1234')).toBe('123.4');
    expect(formatCPF('12345')).toBe('123.45');
    expect(formatCPF('123456')).toBe('123.456');
  });

  it('should format a string with 7 to 9 digits adding two periods', () => {
    expect(formatCPF('1234567')).toBe('123.456.7');
    expect(formatCPF('12345678')).toBe('123.456.78');
    expect(formatCPF('123456789')).toBe('123.456.789');
  });

  it('should format a string with 10 to 11 digits adding periods and a hyphen', () => {
    expect(formatCPF('1234567890')).toBe('123.456.789-0');
    expect(formatCPF('12345678901')).toBe('123.456.789-01');
  });

  it('should strip non-numeric characters before formatting', () => {
    expect(formatCPF('abc123def456ghi789jkl01mno')).toBe('123.456.789-01');
    expect(formatCPF('!@#12$%-34^&5')).toBe('123.45');
  });

  it('should truncate strings with more than 11 numeric digits', () => {
    expect(formatCPF('123456789012345')).toBe('123.456.789-01');
  });
});
