import { describe, expect, it } from 'vitest';
import { decodeApiEnvironment } from './decodeApiEnvironment';

const productionEnvironment = (): Record<string, string | undefined> => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://wave:test-password@db.example.test:5432/wave_atlas',
  FRONTEND_ORIGIN: 'https://wave.example.test',
  BETTER_AUTH_URL: 'https://api.wave.example.test',
  BETTER_AUTH_SECRET: 'test-only-auth-secret-that-is-longer-than-32-characters',
  SERVER_PORT: '3001',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  CLOUDINARY_CLOUD_NAME: 'test-cloud',
  CLOUDINARY_API_KEY: 'test-cloudinary-key',
  CLOUDINARY_API_SECRET: 'test-cloudinary-secret',
  PAYMENT_PROVIDER: 'mock',
});

describe('decodeApiEnvironment', () => {
  it('returns the typed production composition for the mock payment provider', () => {
    const config = decodeApiEnvironment(productionEnvironment());

    expect(config).toMatchObject({
      nodeEnv: 'production',
      databaseUrl: 'postgresql://wave:test-password@db.example.test:5432/wave_atlas',
      frontendOrigin: 'https://wave.example.test',
      betterAuth: {
        baseUrl: 'https://api.wave.example.test',
        secret: 'test-only-auth-secret-that-is-longer-than-32-characters',
      },
      serverPort: 3001,
      google: {
        clientId: 'test-client.apps.googleusercontent.com',
        clientSecret: 'test-google-client-secret',
      },
      cloudinary: {
        cloudName: 'test-cloud',
        apiKey: 'test-cloudinary-key',
        apiSecret: 'test-cloudinary-secret',
      },
      payment: { provider: 'mock' },
    });
  });

  it('uses development-only defaults without inventing Google credentials', () => {
    const environment = productionEnvironment();
    environment.NODE_ENV = 'development';
    environment.FRONTEND_ORIGIN = undefined;
    environment.BETTER_AUTH_SECRET = undefined;
    environment.SERVER_PORT = undefined;
    environment.GOOGLE_CLIENT_ID = undefined;
    environment.GOOGLE_CLIENT_SECRET = undefined;

    const config = decodeApiEnvironment(environment);

    expect(config.frontendOrigin).toBe('http://localhost:3000');
    expect(config.serverPort).toBe(3001);
    expect(config.betterAuth.secret.length).toBeGreaterThanOrEqual(32);
    expect(config.google).toBeNull();
  });

  it.each([
    ['DATABASE_URL', 'database'],
    ['FRONTEND_ORIGIN', 'frontend'],
    ['BETTER_AUTH_URL', 'Better Auth URL'],
    ['BETTER_AUTH_SECRET', 'Better Auth secret'],
    ['GOOGLE_CLIENT_ID', 'Google'],
    ['GOOGLE_CLIENT_SECRET', 'Google'],
    ['CLOUDINARY_CLOUD_NAME', 'Cloudinary'],
    ['CLOUDINARY_API_KEY', 'Cloudinary'],
    ['CLOUDINARY_API_SECRET', 'Cloudinary'],
  ])('rejects production startup when %s is missing', (key, message) => {
    const environment = productionEnvironment();
    environment[key] = undefined;

    expect(() => decodeApiEnvironment(environment)).toThrow(message);
  });

  it.each([
    ['FRONTEND_ORIGIN', 'wave.example.test', 'frontend'],
    ['FRONTEND_ORIGIN', 'https://wave.example.test/app', 'frontend'],
    ['BETTER_AUTH_URL', '/api/auth', 'Better Auth URL'],
    ['BETTER_AUTH_URL', 'https://api.wave.example.test?debug=true', 'Better Auth URL'],
  ])('rejects invalid origin composition for %s=%s', (key, value, message) => {
    const environment = productionEnvironment();
    environment[key] = value;

    expect(() => decodeApiEnvironment(environment)).toThrow(message);
  });

  it.each([
    'change-me',
    'replace-with-at-least-32-random-characters-in-production',
  ])('rejects the weak or placeholder production Better Auth secret %s', (secret) => {
    expect(() => decodeApiEnvironment({
      ...productionEnvironment(),
      BETTER_AUTH_SECRET: secret,
    })).toThrow(/Better Auth secret/i);
  });

  it.each(['0', '65536', '3001.5', 'not-a-port'])(
    'rejects invalid SERVER_PORT=%s',
    (serverPort) => {
      expect(() => decodeApiEnvironment({
        ...productionEnvironment(),
        SERVER_PORT: serverPort,
      })).toThrow(/SERVER_PORT/);
    },
  );

  it('requires Google credentials as a pair outside production too', () => {
    expect(() => decodeApiEnvironment({
      ...productionEnvironment(),
      NODE_ENV: 'test',
      GOOGLE_CLIENT_SECRET: undefined,
    })).toThrow(/Google credentials.*pair/i);
  });

  it('requires an explicit supported payment provider', () => {
    expect(() => decodeApiEnvironment({
      ...productionEnvironment(),
      PAYMENT_PROVIDER: undefined,
    })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => decodeApiEnvironment({
      ...productionEnvironment(),
      PAYMENT_PROVIDER: 'cryptocloud-if-available',
    })).toThrow(/PAYMENT_PROVIDER/);
  });

  it('requires all CryptoCloud credentials only when CryptoCloud is selected', () => {
    const environment = {
      ...productionEnvironment(),
      PAYMENT_PROVIDER: 'cryptocloud',
      CRYPTOCLOUD_API_KEY: 'test-cryptocloud-api-key',
      CRYPTOCLOUD_SHOP_ID: 'test-cryptocloud-shop-id',
      CRYPTOCLOUD_SECRET_KEY: 'test-cryptocloud-secret-key',
    };

    expect(decodeApiEnvironment(environment).payment).toEqual({
      provider: 'cryptocloud',
      apiKey: 'test-cryptocloud-api-key',
      shopId: 'test-cryptocloud-shop-id',
      secretKey: 'test-cryptocloud-secret-key',
    });

    expect(() => decodeApiEnvironment({
      ...environment,
      CRYPTOCLOUD_SECRET_KEY: undefined,
    })).toThrow(/CryptoCloud/);
  });
});
