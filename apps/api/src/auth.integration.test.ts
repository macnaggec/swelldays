import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { auth } from 'server/auth';
import { prisma } from 'server/db';

const createdEmails: string[] = [];

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.$disconnect();
});

describe('Better Auth credential persistence', () => {
  it('signs in a user created with the current account identity contract', async () => {
    const email = `auth-${randomUUID()}@example.com`;
    const password = 'test-password-123';
    createdEmails.push(email);

    await auth.api.signUpEmail({
      body: { email, password, name: 'Auth Integration Test' },
    });

    const signedIn = await auth.api.signInEmail({
      body: { email, password },
    });

    expect(signedIn.user.email).toBe(email);
  });
});
