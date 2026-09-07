import { describe, expect, it } from 'vitest';
import { decodeApiEnvironment } from './decodeApiEnvironment';

const productionEnvironment = (): Record<string, string | undefined> => ({
  NODE_ENV: 'production',
  COMMERCE_MODE: 'test',
  DATABASE_URL: 'postgresql://wave:test-password@db.example.test:5432/swelldays',
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
      databaseUrl: 'postgresql://wave:test-password@db.example.test:5432/swelldays',
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
    ['CLOUDINARY_CLOUD_NAME', 'Cloudinary'],
    ['CLOUDINARY_API_KEY', 'Cloudinary'],
    ['CLOUDINARY_API_SECRET', 'Cloudinary'],
  ])('rejects production startup when %s is missing', (key, message) => {
    const environment = productionEnvironment();
    environment[key] = undefined;

    expect(() => decodeApiEnvironment(environment)).toThrow(message);
  });

  it('allows Google sign-in to stay deferred in production (both credentials absent)', () => {
    const environment = productionEnvironment();
    environment.GOOGLE_CLIENT_ID = undefined;
    environment.GOOGLE_CLIENT_SECRET = undefined;

    const config = decodeApiEnvironment(environment);

    expect(config.google).toBeNull();
  });

  it('defaults sentryDsn to null when SENTRY_DSN is absent', () => {
    expect(decodeApiEnvironment(productionEnvironment()).sentryDsn).toBeNull();
  });

  it('passes through a configured SENTRY_DSN', () => {
    const config = decodeApiEnvironment({
      ...productionEnvironment(),
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    });

    expect(config.sentryDsn).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
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

const livePaddleEnvironment = (): Record<string, string | undefined> => ({
  ...productionEnvironment(),
  COMMERCE_MODE: 'live',
  PAYMENT_PROVIDER: 'paddle',
  PADDLE_API_KEY: 'pdl_live_apikey_fixture',
  PADDLE_WEBHOOK_SECRET: 'fixture-webhook-signing-key',
  PADDLE_ENVIRONMENT: 'production',
  VITE_COMMERCE_MODE: 'live',
  VITE_PAYMENT_PROVIDER: 'paddle',
  VITE_PADDLE_ENVIRONMENT: 'production',
  VITE_PADDLE_CLIENT_TOKEN: 'live_fixture',
});

describe('live commerce API configuration', () => {
  it('accepts matching live Paddle declarations and defaults production to live', () => {
    expect(decodeApiEnvironment(livePaddleEnvironment())).toMatchObject({ commerceMode: 'live' });
    expect(decodeApiEnvironment({ ...livePaddleEnvironment(), COMMERCE_MODE: undefined }))
      .toMatchObject({ commerceMode: 'live' });
  });

  it.each(['development', 'test'])('defaults %s to test commerce', (nodeEnv) => {
    expect(decodeApiEnvironment({ ...productionEnvironment(), NODE_ENV: nodeEnv, COMMERCE_MODE: undefined }))
      .toMatchObject({ commerceMode: 'test' });
  });

  it.each(['live', undefined])('rejects production mock with mode %s', (commerceMode) => {
    expect(() => decodeApiEnvironment({ ...productionEnvironment(), COMMERCE_MODE: commerceMode }))
      .toThrow(/PAYMENT_PROVIDER/);
  });

  it.each([
    ['COMMERCE_MODE', 'liv', 'COMMERCE_MODE'],
    ['PADDLE_ENVIRONMENT', 'sandbox', 'PADDLE_ENVIRONMENT'],
    ['PADDLE_API_KEY', undefined, 'Paddle'],
    ['PADDLE_API_KEY', 'pdl_sdbx_apikey_fixture', 'PADDLE_API_KEY'],
    ['PADDLE_API_KEY', 'pdl_live_apikey_', 'PADDLE_API_KEY'],
    ['PADDLE_API_KEY', 'opaque-key', 'PADDLE_API_KEY'],
    ['PADDLE_WEBHOOK_SECRET', undefined, 'Paddle'],
    ['PADDLE_WEBHOOK_SECRET', 'change-me', 'PADDLE_WEBHOOK_SECRET'],
    ['PADDLE_WEBHOOK_SECRET', 'replace-with-value', 'PADDLE_WEBHOOK_SECRET'],
    ['PADDLE_WEBHOOK_SECRET', 'placeholder', 'PADDLE_WEBHOOK_SECRET'],
    ['PADDLE_WEBHOOK_SECRET', 'your-secret', 'PADDLE_WEBHOOK_SECRET'],
    ['VITE_COMMERCE_MODE', undefined, 'VITE_COMMERCE_MODE'],
    ['VITE_COMMERCE_MODE', 'test', 'VITE_COMMERCE_MODE'],
    ['VITE_PAYMENT_PROVIDER', undefined, 'VITE_PAYMENT_PROVIDER'],
    ['VITE_PAYMENT_PROVIDER', 'cryptocloud', 'VITE_PAYMENT_PROVIDER'],
    ['VITE_PADDLE_ENVIRONMENT', undefined, 'VITE_PADDLE_ENVIRONMENT'],
    ['VITE_PADDLE_ENVIRONMENT', 'sandbox', 'VITE_PADDLE_ENVIRONMENT'],
    ['VITE_PADDLE_CLIENT_TOKEN', undefined, 'VITE_PADDLE_CLIENT_TOKEN'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'test_fixture', 'VITE_PADDLE_CLIENT_TOKEN'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'live_', 'VITE_PADDLE_CLIENT_TOKEN'],
  ])('rejects invalid live %s=%s', (key, value, message) => {
    expect(() => decodeApiEnvironment({ ...livePaddleEnvironment(), [key]: value })).toThrow(message);
  });

  it.each([
    ['VITE_COMMERCE_MODE', 'live'],
    ['VITE_COMMERCE_MODE', 'typo'],
    ['VITE_PAYMENT_PROVIDER', 'paddle'],
    ['VITE_PAYMENT_PROVIDER', 'typo'],
  ])('rejects inconsistent optional test declaration %s=%s', (key, value) => {
    expect(() => decodeApiEnvironment({ ...productionEnvironment(), [key]: value })).toThrow(key);
  });

  it('supports explicit production staging with matching sandbox declarations', () => {
    const environment = { ...livePaddleEnvironment(), COMMERCE_MODE: 'test', VITE_COMMERCE_MODE: 'test',
      PADDLE_ENVIRONMENT: 'sandbox', PADDLE_API_KEY: 'pdl_sdbx_apikey_fixture',
      VITE_PADDLE_ENVIRONMENT: 'sandbox', VITE_PADDLE_CLIENT_TOKEN: 'test_fixture' };
    expect(decodeApiEnvironment(environment)).toMatchObject({ commerceMode: 'test' });
    expect(() => decodeApiEnvironment({ ...environment, PADDLE_API_KEY: 'pdl_live_apikey_fixture' }))
      .toThrow('PADDLE_API_KEY');
    expect(() => decodeApiEnvironment({ ...environment, VITE_PADDLE_ENVIRONMENT: 'production' }))
      .toThrow('VITE_PADDLE_ENVIRONMENT');
    expect(() => decodeApiEnvironment({ ...environment, VITE_PADDLE_CLIENT_TOKEN: 'live_fixture' }))
      .toThrow('VITE_PADDLE_CLIENT_TOKEN');
    expect(() => decodeApiEnvironment({ ...livePaddleEnvironment(), COMMERCE_MODE: 'test',
      VITE_COMMERCE_MODE: 'test', PADDLE_API_KEY: 'pdl_sdbx_apikey_fixture' })).toThrow('PADDLE_API_KEY');
  });

  const liveCryptoCloudEnvironment = () => ({ ...productionEnvironment(), COMMERCE_MODE: 'live',
    PAYMENT_PROVIDER: 'cryptocloud', VITE_COMMERCE_MODE: 'live', VITE_PAYMENT_PROVIDER: 'cryptocloud',
    CRYPTOCLOUD_API_KEY: 'fixture-api-key', CRYPTOCLOUD_SHOP_ID: 'fixture-shop', CRYPTOCLOUD_SECRET_KEY: 'fixture-signing-key' });

  it('accepts live CryptoCloud without inventing a credential format', () => {
    expect(decodeApiEnvironment(liveCryptoCloudEnvironment())).toMatchObject({ commerceMode: 'live', payment: { provider: 'cryptocloud' } });
  });

  it.each(['CRYPTOCLOUD_API_KEY', 'CRYPTOCLOUD_SHOP_ID', 'CRYPTOCLOUD_SECRET_KEY'])('requires non-placeholder live %s', (key) => {
    expect(() => decodeApiEnvironment({ ...liveCryptoCloudEnvironment(), [key]: undefined })).toThrow(/CryptoCloud/);
    expect(() => decodeApiEnvironment({ ...liveCryptoCloudEnvironment(), [key]: 'replace-with-value' })).toThrow(key);
  });
});
