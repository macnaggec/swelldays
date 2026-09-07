export type ApiNodeEnvironment = 'development' | 'test' | 'production';

export type CryptoCloudConfig = {
  apiKey: string;
  shopId: string;
  secretKey: string;
};

export type PaddleConfig = {
  apiKey: string;
  webhookSecret: string;
  environment: 'sandbox' | 'production';
};

export type ApiConfig = {
  nodeEnv: ApiNodeEnvironment;
  commerceMode: 'test' | 'live';
  databaseUrl: string;
  frontendOrigin: string;
  betterAuth: {
    baseUrl: string;
    secret: string;
  };
  serverPort: number;
  google: {
    clientId: string;
    clientSecret: string;
  } | null;
  cloudinary: {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  };
  payment:
    | { provider: 'mock' }
    | ({ provider: 'cryptocloud' } & CryptoCloudConfig)
    | ({ provider: 'paddle' } & PaddleConfig);
  cryptoCloud: CryptoCloudConfig | null;
  paddle: PaddleConfig | null;
  sentryDsn: string | null;
};

const DEVELOPMENT_FRONTEND_ORIGIN = 'http://localhost:3000';
const DEVELOPMENT_AUTH_URL = 'http://localhost:3001';
const DEVELOPMENT_AUTH_SECRET = 'swelldays-local-development-only-secret';

const optionalValue = (
  raw: Record<string, string | undefined>,
  key: string,
): string | undefined => {
  const value = raw[key]?.trim();
  return value ? value : undefined;
};

const requiredValue = (
  raw: Record<string, string | undefined>,
  key: string,
  label: string,
): string => {
  const value = optionalValue(raw, key);
  if (!value) throw new Error(`${label} is required (${key})`);
  return value;
};

const parseNodeEnvironment = (
  value: string | undefined,
): ApiNodeEnvironment => {
  const nodeEnv = value ?? 'development';
  if (nodeEnv === 'development' || nodeEnv === 'test' || nodeEnv === 'production') {
    return nodeEnv;
  }
  throw new Error('NODE_ENV must be development, test, or production');
};

const parseDatabaseUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') || !url.hostname) {
      throw new Error('invalid database protocol');
    }
    return value;
  } catch {
    throw new Error('DATABASE_URL must be an absolute PostgreSQL database URL');
  }
};

const parseHttpOrigin = (value: string, label: string): string => {
  try {
    const url = new URL(value);
    const hasOnlyOrigin = (
      (url.protocol === 'http:' || url.protocol === 'https:')
      && Boolean(url.hostname)
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !url.username
      && !url.password
    );
    if (!hasOnlyOrigin) throw new Error('not an origin');
    return url.origin;
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin without a path`);
  }
};

const parsePort = (value: string | undefined): number => {
  if (value === undefined) return 3001;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('SERVER_PORT must be an integer between 1 and 65535');
  }
  return port;
};

const parseGoogleConfig = (
  raw: Record<string, string | undefined>,
): ApiConfig['google'] => {
  const clientId = optionalValue(raw, 'GOOGLE_CLIENT_ID');
  const clientSecret = optionalValue(raw, 'GOOGLE_CLIENT_SECRET');

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error('Google credentials must be provided as a pair');
  }
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
};

const parseCryptoCloudConfig = (
  raw: Record<string, string | undefined>,
): CryptoCloudConfig | null => {
  const apiKey = optionalValue(raw, 'CRYPTOCLOUD_API_KEY');
  const shopId = optionalValue(raw, 'CRYPTOCLOUD_SHOP_ID');
  const secretKey = optionalValue(raw, 'CRYPTOCLOUD_SECRET_KEY');
  const configuredCount = [apiKey, shopId, secretKey].filter(Boolean).length;

  if (configuredCount === 0) return null;
  if (!apiKey || !shopId || !secretKey) {
    throw new Error('CryptoCloud credentials must be provided together');
  }
  return { apiKey, shopId, secretKey };
};

const parsePaddleConfig = (
  raw: Record<string, string | undefined>,
): PaddleConfig | null => {
  const apiKey = optionalValue(raw, 'PADDLE_API_KEY');
  const webhookSecret = optionalValue(raw, 'PADDLE_WEBHOOK_SECRET');
  const environment = optionalValue(raw, 'PADDLE_ENVIRONMENT');
  const configuredCount = [apiKey, webhookSecret, environment].filter(Boolean).length;

  if (configuredCount === 0) return null;
  if (!apiKey || !webhookSecret || !environment) {
    throw new Error('Paddle credentials must be provided together');
  }
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error('PADDLE_ENVIRONMENT must be sandbox or production');
  }
  return { apiKey, webhookSecret, environment };
};

export function decodeApiEnvironment(
  raw: Record<string, string | undefined>,
): ApiConfig {
  const nodeEnv = parseNodeEnvironment(optionalValue(raw, 'NODE_ENV'));
  const production = nodeEnv === 'production';
  const commerceMode = optionalValue(raw, 'COMMERCE_MODE') ?? (production ? 'live' : 'test');
  if (commerceMode !== 'test' && commerceMode !== 'live') {
    throw new Error('COMMERCE_MODE must be test or live');
  }
  const databaseUrl = parseDatabaseUrl(requiredValue(raw, 'DATABASE_URL', 'database configuration'));

  const frontendOrigin = parseHttpOrigin(
    production
      ? requiredValue(raw, 'FRONTEND_ORIGIN', 'frontend origin')
      : optionalValue(raw, 'FRONTEND_ORIGIN') ?? DEVELOPMENT_FRONTEND_ORIGIN,
    'frontend origin',
  );
  const betterAuthBaseUrl = parseHttpOrigin(
    production
      ? requiredValue(raw, 'BETTER_AUTH_URL', 'Better Auth URL')
      : optionalValue(raw, 'BETTER_AUTH_URL') ?? DEVELOPMENT_AUTH_URL,
    'Better Auth URL',
  );
  const betterAuthSecret = production
    ? requiredValue(raw, 'BETTER_AUTH_SECRET', 'Better Auth secret')
    : optionalValue(raw, 'BETTER_AUTH_SECRET') ?? DEVELOPMENT_AUTH_SECRET;
  const placeholderSecret = /(change.?me|replace.?with|your.?secret|placeholder)/i.test(
    betterAuthSecret,
  );
  if (production && (betterAuthSecret.length < 32 || placeholderSecret)) {
    throw new Error('Better Auth secret must be a non-placeholder value with at least 32 characters in production');
  }

  const cloudName = production
    ? requiredValue(raw, 'CLOUDINARY_CLOUD_NAME', 'Cloudinary cloud name')
    : optionalValue(raw, 'CLOUDINARY_CLOUD_NAME')
      ?? requiredValue(raw, 'VITE_CLOUDINARY_CLOUD_NAME', 'Cloudinary cloud name');
  const cloudinaryApiKey = production
    ? requiredValue(raw, 'CLOUDINARY_API_KEY', 'Cloudinary API key')
    : optionalValue(raw, 'CLOUDINARY_API_KEY')
      ?? requiredValue(raw, 'VITE_CLOUDINARY_API_KEY', 'Cloudinary API key');
  const cloudinaryApiSecret = requiredValue(
    raw,
    'CLOUDINARY_API_SECRET',
    'Cloudinary API secret',
  );

  const paymentProvider = requiredValue(raw, 'PAYMENT_PROVIDER', 'PAYMENT_PROVIDER');
  if (paymentProvider !== 'mock' && paymentProvider !== 'cryptocloud' && paymentProvider !== 'paddle') {
    throw new Error('PAYMENT_PROVIDER must be mock, cryptocloud, or paddle');
  }
  const cryptoCloud = parseCryptoCloudConfig(raw);
  if (paymentProvider === 'cryptocloud' && !cryptoCloud) {
    throw new Error('CryptoCloud credentials are required when PAYMENT_PROVIDER=cryptocloud');
  }
  const paddle = parsePaddleConfig(raw);
  if (paymentProvider === 'paddle' && !paddle) {
    throw new Error('Paddle credentials are required when PAYMENT_PROVIDER=paddle');
  }

  const live = commerceMode === 'live';
  if (live && paymentProvider === 'mock') {
    throw new Error('PAYMENT_PROVIDER cannot be mock when COMMERCE_MODE is live');
  }
  if (paymentProvider === 'paddle' && paddle) {
    if (live && paddle.environment !== 'production') {
      throw new Error('PADDLE_ENVIRONMENT must be production when COMMERCE_MODE is live');
    }
    const oppositePrefix = paddle.environment === 'production' ? 'pdl_sdbx_apikey_' : 'pdl_live_apikey_';
    if (paddle.apiKey.startsWith(oppositePrefix)
      || (live && !/^pdl_live_apikey_.+/.test(paddle.apiKey))) {
      throw new Error('PADDLE_API_KEY must match PADDLE_ENVIRONMENT');
    }
    if (live && /(change.?me|replace.?with|your.?secret|placeholder)/i.test(paddle.webhookSecret)) {
      throw new Error('PADDLE_WEBHOOK_SECRET must be non-placeholder');
    }
  }
  if (live && paymentProvider === 'cryptocloud' && cryptoCloud) {
    for (const key of ['CRYPTOCLOUD_API_KEY', 'CRYPTOCLOUD_SHOP_ID', 'CRYPTOCLOUD_SECRET_KEY']) {
      if (/(change.?me|replace.?with|your.?secret|placeholder)/i.test(optionalValue(raw, key) ?? '')) {
        throw new Error(`${key} must be non-placeholder`);
      }
    }
  }

  const publicMode = optionalValue(raw, 'VITE_COMMERCE_MODE');
  const publicProvider = optionalValue(raw, 'VITE_PAYMENT_PROVIDER');
  if ((live || publicMode !== undefined) && publicMode !== commerceMode) {
    throw new Error('VITE_COMMERCE_MODE must match COMMERCE_MODE');
  }
  if ((live || publicProvider !== undefined) && publicProvider !== paymentProvider) {
    throw new Error('VITE_PAYMENT_PROVIDER must match PAYMENT_PROVIDER');
  }
  if (paymentProvider === 'paddle' && paddle) {
    const publicEnvironment = optionalValue(raw, 'VITE_PADDLE_ENVIRONMENT');
    const publicToken = optionalValue(raw, 'VITE_PADDLE_CLIENT_TOKEN');
    if ((live || publicEnvironment !== undefined) && publicEnvironment !== paddle.environment) {
      throw new Error('VITE_PADDLE_ENVIRONMENT must match PADDLE_ENVIRONMENT');
    }
    const tokenPattern = paddle.environment === 'production' ? /^live_.+/ : /^test_.+/;
    if ((live || publicToken !== undefined) && !tokenPattern.test(publicToken ?? '')) {
      throw new Error('VITE_PADDLE_CLIENT_TOKEN must match PADDLE_ENVIRONMENT');
    }
  }

  return {
    nodeEnv,
    commerceMode,
    databaseUrl,
    frontendOrigin,
    betterAuth: {
      baseUrl: betterAuthBaseUrl,
      secret: betterAuthSecret,
    },
    serverPort: parsePort(optionalValue(raw, 'SERVER_PORT')),
    google: parseGoogleConfig(raw),
    cloudinary: {
      cloudName,
      apiKey: cloudinaryApiKey,
      apiSecret: cloudinaryApiSecret,
    },
    payment: paymentProvider === 'mock'
      ? { provider: 'mock' }
      : paymentProvider === 'cryptocloud'
        ? { provider: 'cryptocloud', ...cryptoCloud! }
        : { provider: 'paddle', ...paddle! },
    cryptoCloud,
    paddle,
    sentryDsn: optionalValue(raw, 'SENTRY_DSN') ?? null,
  };
}
