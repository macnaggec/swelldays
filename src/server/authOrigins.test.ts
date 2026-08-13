import { describe, expect, it } from 'vitest';
import { resolveAuthTrustedOrigins } from 'server/authOrigins';

describe('resolveAuthTrustedOrigins', () => {
  it('allows private-LAN browser origins outside production', () => {
    const origins = resolveAuthTrustedOrigins({
      APP_URL: 'http://localhost:3000',
      NODE_ENV: 'test',
    });

    expect(origins).toContain('http://10.*.*.*:*');
    expect(origins).toContain('http://172.16.*.*:*');
    expect(origins).toContain('http://172.31.*.*:*');
    expect(origins).toContain('https://192.168.*.*:*');
  });

  it('keeps production limited to the explicitly configured app origin', () => {
    const origins = resolveAuthTrustedOrigins({
      APP_URL: 'https://wave-atlas.example',
      NODE_ENV: 'production',
    });

    expect(origins).toEqual(['https://wave-atlas.example']);
  });
});
