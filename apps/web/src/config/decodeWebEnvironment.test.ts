import { describe, expect, it } from 'vitest';
import { decodeWebEnvironment } from './decodeWebEnvironment';

const productionEnvironment = (): Record<string, string | undefined> => ({
  VITE_COMMERCE_MODE: 'test',
  VITE_API_URL: 'https://api.wave.example.test',
  VITE_MAPBOX_ACCESS_TOKEN: 'pk.test-mapbox-token',
  VITE_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  VITE_GOOGLE_API_KEY: 'test-google-api-key',
  VITE_CLOUDINARY_CLOUD_NAME: 'test-cloud',
  VITE_CLOUDINARY_API_KEY: 'test-cloudinary-api-key',
});

describe('decodeWebEnvironment', () => {
  it('returns the browser-safe production configuration', () => {
    expect(decodeWebEnvironment(productionEnvironment(), 'production')).toEqual({
      commerceMode: 'test',
      paymentProvider: 'mock',
      apiOrigin: 'https://api.wave.example.test',
      mapboxAccessToken: 'pk.test-mapbox-token',
      google: {
        clientId: 'test-client.apps.googleusercontent.com',
        apiKey: 'test-google-api-key',
      },
      cloudinary: {
        cloudName: 'test-cloud',
        apiKey: 'test-cloudinary-api-key',
      },
      isDevelopment: false,
      sentryDsn: '',
      paddle: { clientToken: '', environment: '' },
    });
  });

  it.each([
    'VITE_API_URL',
    'VITE_MAPBOX_ACCESS_TOKEN',
    'VITE_GOOGLE_CLIENT_ID',
    'VITE_GOOGLE_API_KEY',
    'VITE_CLOUDINARY_CLOUD_NAME',
    'VITE_CLOUDINARY_API_KEY',
  ])('rejects a production build when %s is missing', (key) => {
    const environment = productionEnvironment();
    environment[key] = undefined;

    expect(() => decodeWebEnvironment(environment, 'production')).toThrow(key);
  });

  it.each([
    '/api',
    'api.wave.example.test',
    'ftp://api.wave.example.test',
    'https://api.wave.example.test/v1',
    'https://api.wave.example.test?debug=true',
  ])('rejects an invalid VITE_API_URL=%s', (apiUrl) => {
    expect(() => decodeWebEnvironment({
      ...productionEnvironment(),
      VITE_API_URL: apiUrl,
    }, 'production')).toThrow(/VITE_API_URL/);
  });

  it('rejects server-only secrets accidentally prefixed for browser exposure', () => {
    expect(() => decodeWebEnvironment({
      ...productionEnvironment(),
      VITE_CLOUDINARY_API_SECRET: 'must-not-enter-the-bundle',
    }, 'production')).toThrow(/server-only.*VITE_CLOUDINARY_API_SECRET/i);
  });

  it('keeps development usable with relative API proxying and absent optional integrations', () => {
    expect(decodeWebEnvironment({}, 'development')).toEqual({
      commerceMode: 'test',
      paymentProvider: 'mock',
      apiOrigin: '',
      mapboxAccessToken: '',
      google: { clientId: '', apiKey: '' },
      cloudinary: { cloudName: '', apiKey: '' },
      isDevelopment: true,
      sentryDsn: '',
      paddle: { clientToken: '', environment: '' },
    });
  });

  it('still validates an explicitly configured development API origin', () => {
    expect(() => decodeWebEnvironment({ VITE_API_URL: 'localhost:3001' }, 'development'))
      .toThrow(/VITE_API_URL/);
  });
});

const liveWebEnvironment = (): Record<string, string | undefined> => ({
  ...productionEnvironment(), VITE_COMMERCE_MODE: 'live', VITE_PAYMENT_PROVIDER: 'paddle',
  VITE_PADDLE_ENVIRONMENT: 'production', VITE_PADDLE_CLIENT_TOKEN: 'live_fixture',
});

describe('live commerce web configuration', () => {
  it('accepts live Paddle and defaults a production build to live', () => {
    expect(decodeWebEnvironment(liveWebEnvironment(), 'production')).toMatchObject({ commerceMode: 'live', paymentProvider: 'paddle' });
    expect(decodeWebEnvironment({ ...liveWebEnvironment(), VITE_COMMERCE_MODE: undefined }, 'production'))
      .toMatchObject({ commerceMode: 'live' });
  });

  it('requires a live provider when production omits explicit commerce mode', () => {
    expect(() => decodeWebEnvironment({ ...productionEnvironment(), VITE_COMMERCE_MODE: undefined }, 'production'))
      .toThrow('VITE_PAYMENT_PROVIDER');
  });

  it.each([
    ['VITE_COMMERCE_MODE', 'typo'],
    ['VITE_PAYMENT_PROVIDER', 'mock'],
    ['VITE_PAYMENT_PROVIDER', 'typo'],
    ['VITE_PAYMENT_PROVIDER', undefined],
    ['VITE_PADDLE_ENVIRONMENT', undefined],
    ['VITE_PADDLE_ENVIRONMENT', ''],
    ['VITE_PADDLE_ENVIRONMENT', 'sandbox'],
    ['VITE_PADDLE_ENVIRONMENT', 'typo'],
    ['VITE_PADDLE_CLIENT_TOKEN', undefined],
    ['VITE_PADDLE_CLIENT_TOKEN', ''],
    ['VITE_PADDLE_CLIENT_TOKEN', 'test_fixture'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'live_'],
  ])('rejects unsafe live %s=%s', (key, value) => {
    expect(() => decodeWebEnvironment({ ...liveWebEnvironment(), [key]: value }, 'production')).toThrow(key);
  });

  it.each([
    ['VITE_PADDLE_ENVIRONMENT', 'sandbox'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'test_fixture'],
  ])('rejects stale test Paddle %s even with CryptoCloud selected', (key, value) => {
    expect(() => decodeWebEnvironment({ ...liveWebEnvironment(), VITE_PAYMENT_PROVIDER: 'cryptocloud', [key]: value }, 'production')).toThrow(key);
  });

  it('accepts live CryptoCloud without Paddle declarations', () => {
    expect(decodeWebEnvironment({ ...productionEnvironment(), VITE_COMMERCE_MODE: 'live', VITE_PAYMENT_PROVIDER: 'cryptocloud' }, 'production'))
      .toMatchObject({ commerceMode: 'live', paymentProvider: 'cryptocloud' });
  });

  it('supports explicit test staging with Paddle sandbox', () => {
    expect(decodeWebEnvironment({ ...productionEnvironment(), VITE_PAYMENT_PROVIDER: 'paddle',
      VITE_PADDLE_ENVIRONMENT: 'sandbox', VITE_PADDLE_CLIENT_TOKEN: 'test_fixture' }, 'production'))
      .toMatchObject({ commerceMode: 'test', paymentProvider: 'paddle' });
  });

  it.each([
    ['VITE_PADDLE_ENVIRONMENT', undefined],
    ['VITE_PADDLE_ENVIRONMENT', 'typo'],
    ['VITE_PADDLE_CLIENT_TOKEN', undefined],
    ['VITE_PADDLE_CLIENT_TOKEN', 'test_'],
    ['VITE_PADDLE_CLIENT_TOKEN', 'live_fixture'],
  ])('validates selected sandbox Paddle %s=%s in test mode', (key, value) => {
    expect(() => decodeWebEnvironment({ VITE_PAYMENT_PROVIDER: 'paddle', VITE_PADDLE_ENVIRONMENT: 'sandbox',
      VITE_PADDLE_CLIENT_TOKEN: 'test_fixture', [key]: value }, 'development')).toThrow(key);
  });
});
