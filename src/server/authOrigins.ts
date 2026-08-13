type AuthOriginEnvironment = {
  APP_URL?: string;
  CLIENT_URL?: string;
  NODE_ENV?: string;
};

const DEFAULT_APP_ORIGIN = 'http://localhost:3000';

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

  return [appOrigin, ...PRIVATE_LAN_DEVELOPMENT_ORIGINS];
}
