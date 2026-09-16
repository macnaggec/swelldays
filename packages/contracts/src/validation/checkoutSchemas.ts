import { z } from 'zod';

export type CheckoutStatusLocator =
  | { orderId: string }
  | { clientRequestId: string };

export type BuyerCheckoutFailureReason =
  | 'provider-rejected'
  | 'provider-timeout'
  | 'provider-unreachable'
  | 'provider-response-invalid'
  | 'local-persistence-failed'
  | 'stale-creating'
  | 'authoritative-expiry'
  | 'provider-cancelled'
  | 'inconsistent-attempt'
  | 'missing-attempt'
  | 'order-failed';

export type BuyerCheckoutStatus =
  | { state: 'not-found' }
  | { state: 'ready'; orderId: string; checkoutUrl: string }
  | { state: 'creating'; orderId: string }
  | { state: 'unknown'; orderId: string; reason: BuyerCheckoutFailureReason }
  | { state: 'processing'; orderId: string }
  | { state: 'paid'; orderId: string }
  | { state: 'failed'; orderId: string; reason: BuyerCheckoutFailureReason };

const checkoutFailureReasonSchema = z.enum([
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
  'order-failed',
]);

export const checkoutStatusLocatorSchema: z.ZodType<CheckoutStatusLocator> = z.union([
  z.object({ orderId: z.uuid() }).strict(),
  z.object({ clientRequestId: z.uuid() }).strict(),
]);

export const buyerCheckoutStatusSchema: z.ZodType<BuyerCheckoutStatus> = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not-found') }).strict(),
  z.object({ state: z.literal('ready'), orderId: z.uuid(), checkoutUrl: z.url() }).strict(),
  z.object({ state: z.literal('creating'), orderId: z.uuid() }).strict(),
  z.object({ state: z.literal('unknown'), orderId: z.uuid(), reason: checkoutFailureReasonSchema }).strict(),
  z.object({ state: z.literal('processing'), orderId: z.uuid() }).strict(),
  z.object({ state: z.literal('paid'), orderId: z.uuid() }).strict(),
  z.object({ state: z.literal('failed'), orderId: z.uuid(), reason: checkoutFailureReasonSchema }).strict(),
]);

export const createCheckoutSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
  clientRequestId: z.uuid(),
  guestEmail: z.string().email().optional(),
});

export const getSignedMediaAccessSchema = z.object({
  mediaItemId: z.uuid(),
});

export const getSignedMediaAccessByTokenSchema = z.object({
  downloadToken: z.string().length(64),
});

export const getGuestPurchasesSchema = z.object({
  orderId: z.uuid(),
});

export const getGuestDownloadAccessSchema = z.object({
  purchaseId: z.uuid(),
  orderId: z.uuid(),
});

export const saveGuestEmailSchema = z.object({
  orderId: z.uuid(),
  email: z.string().email(),
});
