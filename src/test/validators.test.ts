import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatCPF, lookupCEP } from '../lib/validators';

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

describe('lookupCEP', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('should return null for invalid CEP lengths without calling fetch', async () => {
    expect(await lookupCEP('1234567')).toBeNull();
    expect(await lookupCEP('123456789')).toBeNull();
    expect(await lookupCEP('')).toBeNull();
    expect(await lookupCEP('abc-def')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should call the API and return data on successful response', async () => {
    const mockData = {
      cep: '01001-000',
      logradouro: 'Praça da Sé',
      complemento: 'lado ímpar',
      bairro: 'Sé',
      localidade: 'São Paulo',
      uf: 'SP'
    };

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => mockData,
    });

    const result = await lookupCEP('01001-000');

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockData);
  });

  it('should return null if API returns { erro: true }', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ erro: true }),
    });

    const result = await lookupCEP('99999-999');

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/99999999/json/');
    expect(result).toBeNull();
  });

  it('should return null if fetch throws a network error', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const result = await lookupCEP('01001-000');

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/');
    expect(result).toBeNull();
  });

  it('should return null if JSON parsing fails', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => { throw new Error('Invalid JSON'); },
    });

    const result = await lookupCEP('01001-000');

    expect(global.fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/');
    expect(result).toBeNull();
  });
});
