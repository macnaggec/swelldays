import { afterEach, describe, expect, it } from 'vitest';
import { consumeAuthReloadIntent, writeAuthReloadIntent } from './authReloadIntent';

describe('authReloadIntent', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips the mode across a write and a single consuming read', () => {
    writeAuthReloadIntent('register');

    expect(consumeAuthReloadIntent()).toBe('register');
    expect(consumeAuthReloadIntent()).toBeNull();
  });

  it('ignores an absent or invalid stored value', () => {
    expect(consumeAuthReloadIntent()).toBeNull();

    window.sessionStorage.setItem('swelldays:auth-reload-intent:v1', 'not-a-mode');
    expect(consumeAuthReloadIntent()).toBeNull();
  });

  it('fails silently when storage is unavailable', () => {
    const originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => { throw new Error('storage denied'); },
        setItem: () => { throw new Error('storage denied'); },
        removeItem: () => {},
      },
    });

    try {
      expect(() => writeAuthReloadIntent('login')).not.toThrow();
      expect(consumeAuthReloadIntent()).toBeNull();
    } finally {
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: originalSessionStorage,
      });
    }
  });
});
