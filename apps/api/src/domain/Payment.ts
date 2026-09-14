export const PAYMENT_PROVIDERS = ['mock', 'cryptocloud', 'paddle'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_ENVIRONMENTS = ['test', 'sandbox', 'production'] as const;
export type PaymentEnvironment = (typeof PAYMENT_ENVIRONMENTS)[number];

export const PAYMENT_ATTEMPT_CREATION_STATES = [
  'creating',
  'ready',
  'unknown',
  'definitively-failed',
] as const;
export type PaymentAttemptCreationState =
  (typeof PAYMENT_ATTEMPT_CREATION_STATES)[number];

export const PAYMENT_CREATION_FAILURE_CODES = [
  'provider-rejected',
  'provider-timeout',
  'provider-unreachable',
  'provider-response-invalid',
  'local-persistence-failed',
  'stale-creating',
  'authoritative-expiry',
  'provider-cancelled',
  'inconsistent-attempt',
  'missing-attempt',
] as const;
export type PaymentCreationFailureCode =
  (typeof PAYMENT_CREATION_FAILURE_CODES)[number];

export type PaymentIdentity = {
  provider: PaymentProvider;
  environment: PaymentEnvironment;
  providerTransactionId: string;
};

export function paymentIdentityKey(identity: PaymentIdentity): string {
  return JSON.stringify([
    identity.provider,
    identity.environment,
    identity.providerTransactionId,
  ]);
}
