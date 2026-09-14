CREATE TYPE "PaymentNotificationStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'RETRY_WAIT', 'COMPLETED', 'REJECTED', 'EXHAUSTED');
CREATE TYPE "PaymentNotificationResolution" AS ENUM ('FULFILLED', 'COMPLETED_DUPLICATE', 'IGNORED', 'UNKNOWN_ORDER', 'ORDER_NOT_PENDING', 'MISMATCHED_TRANSACTION', 'REJECTED_RECEIPT');

CREATE TABLE "payment_notifications" (
  "id" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "source_event_id" TEXT,
  "occurred_at" TIMESTAMP(3),
  "environment" "PaymentEnvironment",
  "provider_transaction_id" TEXT,
  "correlation_attempt_id" TEXT,
  "provider_test_mode" BOOLEAN,
  "payment_attempt_id" TEXT,
  "order_id" TEXT,
  "status" "PaymentNotificationStatus" NOT NULL DEFAULT 'RECEIVED',
  "resolution" "PaymentNotificationResolution",
  "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claim_token" TEXT,
  "claim_expires_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "payment_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_notifications_event_key_key" ON "payment_notifications"("event_key");
CREATE INDEX "payment_notifications_claim_idx" ON "payment_notifications"("status", "available_at", "claim_expires_at");
CREATE INDEX "payment_notifications_status_received_idx" ON "payment_notifications"("status", "received_at" DESC, "id" DESC);
CREATE INDEX "payment_notifications_received_idx" ON "payment_notifications"("received_at" DESC, "id" DESC);
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_notifications" ADD CONSTRAINT "payment_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
