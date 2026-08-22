import { describe, expect, it } from 'vitest';
import { decodeWebEnvironment } from './decodeWebEnvironment';

const productionEnvironment = (): Record<string, string | undefined> => ({
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
      apiOrigin: '',
      mapboxAccessToken: '',
      google: { clientId: '', apiKey: '' },
      cloudinary: { cloudName: '', apiKey: '' },
      isDevelopment: true,
      sentryDsn: '',
    });
  });

  it('still validates an explicitly configured development API origin', () => {
    expect(() => decodeWebEnvironment({ VITE_API_URL: 'localhost:3001' }, 'development'))
      .toThrow(/VITE_API_URL/);
  });
});
