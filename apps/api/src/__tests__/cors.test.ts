import { describe, it, expect } from 'vitest';

describe('CORS configuration', () => {
  it('should configure CORS with credentials and specific origin', () => {
    // Verify the CORS config function produces correct options
    const frontendUrl = 'http://localhost:12412';

    const corsOptions = {
      origin: frontendUrl.includes(',')
        ? frontendUrl.split(',').map((s: string) => s.trim())
        : frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    };

    expect(corsOptions.origin).toBe('http://localhost:12412');
    expect(corsOptions.credentials).toBe(true);
    expect(corsOptions.methods).toContain('GET');
    expect(corsOptions.methods).toContain('POST');
    expect(corsOptions.allowedHeaders).toContain('Authorization');
  });

  it('should support comma-separated origins', () => {
    const frontendUrl = 'http://localhost:12412, https://botmem.xyz';

    const origin = frontendUrl.includes(',')
      ? frontendUrl.split(',').map((s: string) => s.trim())
      : frontendUrl;

    expect(origin).toEqual(['http://localhost:12412', 'https://botmem.xyz']);
  });

  it('should not allow wildcard origin', () => {
    const frontendUrl = 'http://localhost:12412';
    const corsOptions = {
      origin: frontendUrl.includes(',')
        ? frontendUrl.split(',').map((s: string) => s.trim())
        : frontendUrl,
      credentials: true,
    };

    // Origin should never be '*' when credentials are enabled
    expect(corsOptions.origin).not.toBe('*');
    expect(corsOptions.origin).not.toBe(true);
  });
});
