type AuthOriginEnvironment = {
  APP_URL?: string;
  CLIENT_URL?: string;
  NODE_ENV?: string;
};

const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'https://localhost:3000',
  'http://127.0.0.1:3000',
  'https://127.0.0.1:3000',
  'http://10.*.*.*:*',
  ...Array.from({ length: 16 }, (_, index) => `http://172.${index + 16}.*.*:*`),
  'https://192.168.*.*:*',
];

const PRIVATE_LAN_DEVELOPMENT_ORIGINS = [
  'http://10.*.*.*:*',
  ...Array.from({ length: 16 }, (_, index) => `http://172.${index + 16}.*.*:*`),
  'https://192.168.*.*:*',
];

export function resolveAuthTrustedOrigins(environment: AuthOriginEnvironment): string[] {
  const appOrigin = environment.CLIENT_URL ?? environment.APP_URL ?? DEFAULT_APP_ORIGIN;

  if (environment.NODE_ENV === 'production') {
    return [appOrigin];
  }

  return Array.from(new Set([appOrigin, ...LOCAL_DEVELOPMENT_ORIGINS, ...PRIVATE_LAN_DEVELOPMENT_ORIGINS]));
}
