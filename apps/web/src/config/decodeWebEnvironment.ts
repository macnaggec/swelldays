export type WebConfig = {
  commerceMode: 'test' | 'live';
  paymentProvider: 'mock' | 'cryptocloud' | 'paddle';
  apiOrigin: string;
  mapboxAccessToken: string;
  google: {
    clientId: string;
    apiKey: string;
  };
  cloudinary: {
    cloudName: string;
    apiKey: string;
  };
  isDevelopment: boolean;
  sentryDsn: string;
  paddle: {
    clientToken: string;
    environment: string;
  };
};

const optionalValue = (
  raw: Record<string, string | undefined>,
  key: string,
): string => raw[key]?.trim() ?? '';

const requiredProductionValue = (
  raw: Record<string, string | undefined>,
  key: string,
  production: boolean,
): string => {
  const value = optionalValue(raw, key);
  if (production && !value) {
    throw new Error(`${key} is required for a production web build`);
  }
  return value;
};

const parseApiOrigin = (value: string): string => {
  if (!value) return '';
  try {
    const url = new URL(value);
    const isOrigin = (
      (url.protocol === 'http:' || url.protocol === 'https:')
      && Boolean(url.hostname)
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !url.username
      && !url.password
    );
    if (!isOrigin) throw new Error('not an origin');
    return url.origin;
  } catch {
    throw new Error('VITE_API_URL must be an absolute HTTP(S) API origin without a path');
  }
};

const assertNoServerSecrets = (
  raw: Record<string, string | undefined>,
): void => {
  const forbiddenKey = Object.keys(raw).find((key) => (
    key.startsWith('VITE_')
    && Boolean(optionalValue(raw, key))
    && (
      key.includes('SECRET')
      || key === 'VITE_DATABASE_URL'
      || key.startsWith('VITE_CRYPTOCLOUD_')
    )
  ));
  if (forbiddenKey) {
    throw new Error(`Server-only configuration cannot use browser-exposed key ${forbiddenKey}`);
  }
};

export function decodeWebEnvironment(
  raw: Record<string, string | undefined>,
  mode: string,
): WebConfig {
  assertNoServerSecrets(raw);
  const production = mode === 'production';
  const commerceMode = optionalValue(raw, 'VITE_COMMERCE_MODE') || (production ? 'live' : 'test');
  if (commerceMode !== 'test' && commerceMode !== 'live') {
    throw new Error('VITE_COMMERCE_MODE must be test or live');
  }
  const live = commerceMode === 'live';
  const paymentProvider = optionalValue(raw, 'VITE_PAYMENT_PROVIDER') || (live ? '' : 'mock');
  if (paymentProvider !== 'mock' && paymentProvider !== 'cryptocloud' && paymentProvider !== 'paddle') {
    throw new Error('VITE_PAYMENT_PROVIDER must be mock, cryptocloud, or paddle');
  }
  if (live && paymentProvider === 'mock') {
    throw new Error('VITE_PAYMENT_PROVIDER cannot be mock when VITE_COMMERCE_MODE is live');
  }
  const environment = optionalValue(raw, 'VITE_PADDLE_ENVIRONMENT');
  const clientToken = optionalValue(raw, 'VITE_PADDLE_CLIENT_TOKEN');
  if (live && environment === 'sandbox') {
    throw new Error('VITE_PADDLE_ENVIRONMENT cannot be sandbox when VITE_COMMERCE_MODE is live');
  }
  if (live && clientToken.startsWith('test_')) {
    throw new Error('VITE_PADDLE_CLIENT_TOKEN cannot use test_ when VITE_COMMERCE_MODE is live');
  }
  if (paymentProvider === 'paddle') {
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new Error('VITE_PADDLE_ENVIRONMENT must be sandbox or production');
    }
    const tokenPattern = environment === 'production' ? /^live_.+/ : /^test_.+/;
    if (!tokenPattern.test(clientToken)) {
      throw new Error('VITE_PADDLE_CLIENT_TOKEN must match VITE_PADDLE_ENVIRONMENT');
    }
  }

  return {
    commerceMode,
    paymentProvider,
    apiOrigin: parseApiOrigin(requiredProductionValue(raw, 'VITE_API_URL', production)),
    mapboxAccessToken: requiredProductionValue(
      raw,
      'VITE_MAPBOX_ACCESS_TOKEN',
      production,
    ),
    google: {
      clientId: requiredProductionValue(raw, 'VITE_GOOGLE_CLIENT_ID', production),
      apiKey: requiredProductionValue(raw, 'VITE_GOOGLE_API_KEY', production),
    },
    cloudinary: {
      cloudName: requiredProductionValue(
        raw,
        'VITE_CLOUDINARY_CLOUD_NAME',
        production,
      ),
      apiKey: requiredProductionValue(raw, 'VITE_CLOUDINARY_API_KEY', production),
    },
    isDevelopment: mode === 'development',
    sentryDsn: optionalValue(raw, 'VITE_SENTRY_DSN'),
    paddle: {
      clientToken,
      environment,
    },
  };
}
