import { describe, expect, it } from 'vitest';
import { resolveAuthTrustedOrigins } from 'server/authOrigins';

describe('resolveAuthTrustedOrigins', () => {
  it('allows both local http and https origins outside production', () => {
    const origins = resolveAuthTrustedOrigins({
      frontendOrigin: 'http://localhost:3000',
      nodeEnv: 'test',
    });

    expect(origins).toContain('http://localhost:3000');
    expect(origins).toContain('https://localhost:3000');
    expect(origins).toContain('http://127.0.0.1:3000');
    expect(origins).toContain('https://127.0.0.1:3000');
  });

  it('allows private-LAN browser origins outside production', () => {
    const origins = resolveAuthTrustedOrigins({
      frontendOrigin: 'http://localhost:3000',
      nodeEnv: 'test',
    });

    expect(origins).toContain('http://10.*.*.*:*');
    expect(origins).toContain('http://172.16.*.*:*');
    expect(origins).toContain('http://172.31.*.*:*');
    expect(origins).toContain('https://192.168.*.*:*');
  });

  it('keeps production limited to the explicitly configured app origin', () => {
    const origins = resolveAuthTrustedOrigins({
      frontendOrigin: 'https://wave-atlas.example',
      nodeEnv: 'production',
    });

    expect(origins).toEqual(['https://wave-atlas.example']);
  });
});
