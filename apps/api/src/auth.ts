import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from 'server/db';
import { resolveAuthTrustedOrigins } from 'server/authOrigins';
import { apiConfig } from 'server/config/env';

const socialProviders = apiConfig.google
  ? {
      google: {
        clientId: apiConfig.google.clientId,
        clientSecret: apiConfig.google.clientSecret,
      },
    }
  : {};

export const auth = betterAuth({
  baseURL: apiConfig.betterAuth.baseUrl,
  secret: apiConfig.betterAuth.secret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  socialProviders,
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days
  },
  trustedOrigins: resolveAuthTrustedOrigins({
    frontendOrigin: apiConfig.frontendOrigin,
    nodeEnv: apiConfig.nodeEnv,
  }),
});

export type Auth = typeof auth;
