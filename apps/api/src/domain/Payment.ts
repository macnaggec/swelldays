export const PAYMENT_PROVIDERS = ['mock', 'cryptocloud', 'paddle'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_ENVIRONMENTS = ['test', 'sandbox', 'production'] as const;
export type PaymentEnvironment = (typeof PAYMENT_ENVIRONMENTS)[number];

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
