import { paymentIdentityKey } from 'server/domain/Payment';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { paymentAdapter } from 'server/providers/payment/activeAdapter';
import type { IPaymentAttemptRepository } from 'server/repositories/PaymentAttemptRepository';
import { paymentAttemptRepository } from 'server/repositories/PaymentAttemptRepository';
import { PurchaseFulfillmentService, purchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';

export type CreatePaymentAttemptCommand = {
  orderId: string;
  totalCents: number;
  successUrl: string;
  failUrl: string;
};

export type CreatedPaymentAttempt = {
  checkoutUrl: string;
  expiresAt: Date | null;
};

export type PaymentNotificationOutcome =
  | { type: 'invalid-signature' }
  | { type: 'ignored' }
  | { type: 'unknown-transaction' }
  | { type: 'mismatched-correlation' }
  | { type: 'fulfilled' };

export interface IPaymentService {
  createAttempt(command: CreatePaymentAttemptCommand): Promise<CreatedPaymentAttempt>;
  acceptVerifiedNotification(
    adapter: PaymentAdapter,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentNotificationOutcome>;
}

export class PaymentService implements IPaymentService {
  constructor(
    private attempts: IPaymentAttemptRepository,
    private checkoutAdapter: PaymentAdapter,
    private fulfillment: Pick<PurchaseFulfillmentService, 'fulfillOrder'>,
  ) { }

  async createAttempt(command: CreatePaymentAttemptCommand): Promise<CreatedPaymentAttempt> {
    const attempt = await this.attempts.createAttempt({
      orderId: command.orderId,
      provider: this.checkoutAdapter.provider,
      expectedAmountCents: command.totalCents,
      expectedCurrency: 'USD',
    });
    const session = await this.checkoutAdapter.createCheckoutSession({
      paymentAttemptId: attempt.id,
      totalCents: command.totalCents,
      successUrl: command.successUrl,
      failUrl: command.failUrl,
    });
    const bound = await this.attempts.bindProviderSession({
      attemptId: attempt.id,
      environment: session.environment,
      providerTransactionId: session.providerTransactionId,
      checkoutUrl: session.checkoutUrl,
      expiresAt: session.expiresAt,
      providerTestMode: session.providerTestMode,
    });

    if (session.settlement === 'completed') {
      await this.fulfillment.fulfillOrder(bound.orderId, paymentIdentityKey({
        provider: bound.provider,
        environment: session.environment,
        providerTransactionId: session.providerTransactionId,
      }));
    }
    return { checkoutUrl: session.checkoutUrl, expiresAt: session.expiresAt };
  }

  async acceptVerifiedNotification(
    adapter: PaymentAdapter,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentNotificationOutcome> {
    if (!adapter.verifyWebhook(rawBody, headers)) return { type: 'invalid-signature' };
    const event = adapter.parseWebhookEvent(rawBody, headers);
    if (event.type === 'order.ignored') return { type: 'ignored' };

    const attempt = await this.attempts.findByIdentity(event.identity);
    if (attempt === null) return { type: 'unknown-transaction' };
    if (event.correlationAttemptId !== attempt.id) return { type: 'mismatched-correlation' };

    await this.fulfillment.fulfillOrder(attempt.orderId, paymentIdentityKey(event.identity));
    return { type: 'fulfilled' };
  }
}

export const paymentService = new PaymentService(
  paymentAttemptRepository,
  paymentAdapter,
  purchaseFulfillmentService,
);
