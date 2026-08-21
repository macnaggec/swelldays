export type ApiNodeEnvironment = 'development' | 'test' | 'production';

export type CryptoCloudConfig = {
  apiKey: string;
  shopId: string;
  secretKey: string;
};

export type ApiConfig = {
  nodeEnv: ApiNodeEnvironment;
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
    | ({ provider: 'cryptocloud' } & CryptoCloudConfig);
  cryptoCloud: CryptoCloudConfig | null;
};

const DEVELOPMENT_FRONTEND_ORIGIN = 'http://localhost:3000';
const DEVELOPMENT_AUTH_URL = 'http://localhost:3001';
const DEVELOPMENT_AUTH_SECRET = 'wave-atlas-local-development-only-secret';

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

export function decodeApiEnvironment(
  raw: Record<string, string | undefined>,
): ApiConfig {
  const nodeEnv = parseNodeEnvironment(optionalValue(raw, 'NODE_ENV'));
  const production = nodeEnv === 'production';
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
  if (paymentProvider !== 'mock' && paymentProvider !== 'cryptocloud') {
    throw new Error('PAYMENT_PROVIDER must be mock or cryptocloud');
  }
  const cryptoCloud = parseCryptoCloudConfig(raw);
  if (paymentProvider === 'cryptocloud' && !cryptoCloud) {
    throw new Error('CryptoCloud credentials are required when PAYMENT_PROVIDER=cryptocloud');
  }

  return {
    nodeEnv,
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
      : { provider: 'cryptocloud', ...cryptoCloud! },
    cryptoCloud,
  };
}
