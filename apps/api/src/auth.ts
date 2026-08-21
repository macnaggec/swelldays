import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from 'server/db';
import { resolveAuthTrustedOrigins } from 'server/authOrigins';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days
  },
  trustedOrigins: resolveAuthTrustedOrigins({
    APP_URL: process.env.APP_URL,
    CLIENT_URL: process.env.CLIENT_URL,
    NODE_ENV: process.env.NODE_ENV,
  }),
});

export type Auth = typeof auth;
