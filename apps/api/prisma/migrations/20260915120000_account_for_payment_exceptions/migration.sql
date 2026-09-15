ALTER TYPE "PaymentNotificationResolution" ADD VALUE 'FULFILLED_WITH_EXCEPTIONS';
ALTER TYPE "PaymentNotificationResolution" ADD VALUE 'ADJUSTMENT_RECORDED';
ALTER TYPE "TransactionType" ADD VALUE 'ADJUSTMENT';

CREATE TYPE "PaidOrderLineDeliveryStatus" AS ENUM ('DELIVERED', 'COMPENSATION_REQUIRED');
CREATE TYPE "PaymentAdjustmentAction" AS ENUM ('REFUND', 'CREDIT', 'DISPUTE', 'DISPUTE_REVERSAL', 'WARNING', 'WARNING_REVERSAL', 'CREDIT_REVERSAL');
CREATE TYPE "PaymentAdjustmentProviderStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVERSED');
CREATE TYPE "PaymentAdjustmentResolution" AS ENUM ('PENDING_REVIEW', 'APPLIED', 'DISMISSED');

ALTER TABLE "payment_notifications"
  ADD COLUMN "adjustment_provider_id" TEXT,
  ADD COLUMN "adjustment_action" TEXT,
  ADD COLUMN "adjustment_status" TEXT,
  ADD COLUMN "adjustment_amount_cents" INTEGER,
  ADD COLUMN "adjustment_currency" TEXT,
  ADD COLUMN "adjustment_updated_at" TIMESTAMP(3);

ALTER TABLE "purchases" ADD COLUMN "revoked_at" TIMESTAMP(3);
DROP INDEX "purchases_buyer_media_key";
CREATE UNIQUE INDEX "purchases_active_buyer_media_key"
  ON "purchases"("buyer_id", "media_item_id")
  WHERE "revoked_at" IS NULL AND "buyer_id" IS NOT NULL;

CREATE TABLE "paid_order_lines" (
  "id" TEXT NOT NULL, "payment_attempt_id" TEXT NOT NULL, "order_item_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL, "media_item_id" TEXT NOT NULL, "seller_id" TEXT NOT NULL,
  "buyer_id" TEXT, "guest_email" TEXT, "amount_paid" INTEGER NOT NULL,
  "platform_fee" INTEGER NOT NULL, "seller_earnings" INTEGER NOT NULL, "currency" TEXT NOT NULL,
  "deliverable_public_id" TEXT NOT NULL, "deliverable_type" "MediaType" NOT NULL,
  "delivery_status" "PaidOrderLineDeliveryStatus" NOT NULL, "purchase_id" TEXT,
  "exception_reason" TEXT, "resolved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "paid_order_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "paid_order_lines_positive_amount_check" CHECK ("amount_paid" > 0),
  CONSTRAINT "paid_order_lines_nonnegative_fee_check" CHECK ("platform_fee" >= 0),
  CONSTRAINT "paid_order_lines_nonnegative_earnings_check" CHECK ("seller_earnings" >= 0),
  CONSTRAINT "paid_order_lines_conservation_check" CHECK ("amount_paid" = "platform_fee" + "seller_earnings")
);

CREATE TABLE "payment_adjustments" (
  "id" TEXT NOT NULL, "provider" "PaymentProvider" NOT NULL, "environment" "PaymentEnvironment" NOT NULL,
  "provider_adjustment_id" TEXT NOT NULL, "payment_attempt_id" TEXT NOT NULL,
  "action" "PaymentAdjustmentAction" NOT NULL, "provider_status" "PaymentAdjustmentProviderStatus" NOT NULL,
  "amount_cents" INTEGER NOT NULL, "currency" TEXT NOT NULL, "occurred_at" TIMESTAMP(3) NOT NULL,
  "provider_updated_at" TIMESTAMP(3) NOT NULL, "resolution" "PaymentAdjustmentResolution" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reverses_adjustment_id" TEXT, "operator_note" TEXT,
  "operator_id" TEXT, "resolved_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "payment_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_adjustments_positive_amount_check" CHECK ("amount_cents" > 0)
);

CREATE TABLE "payment_adjustment_allocations" (
  "id" TEXT NOT NULL, "payment_adjustment_id" TEXT NOT NULL, "paid_order_line_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL, "seller_ledger_amount" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_adjustment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_adjustment_allocations_positive_amount_check" CHECK ("amount_cents" > 0)
);

ALTER TABLE "transactions" ADD COLUMN "paid_order_line_id" TEXT;
ALTER TABLE "transactions" ADD COLUMN "payment_adjustment_allocation_id" TEXT;

CREATE UNIQUE INDEX "paid_order_lines_attempt_order_item_key" ON "paid_order_lines"("payment_attempt_id", "order_item_id");
CREATE INDEX "paid_order_lines_attempt_idx" ON "paid_order_lines"("payment_attempt_id");
CREATE INDEX "paid_order_lines_order_idx" ON "paid_order_lines"("order_id");
CREATE INDEX "paid_order_lines_seller_status_idx" ON "paid_order_lines"("seller_id", "delivery_status");
CREATE INDEX "paid_order_lines_buyer_media_idx" ON "paid_order_lines"("buyer_id", "media_item_id");
CREATE UNIQUE INDEX "payment_adjustments_provider_environment_id_key" ON "payment_adjustments"("provider", "environment", "provider_adjustment_id");
CREATE UNIQUE INDEX "payment_adjustments_reverses_adjustment_id_key" ON "payment_adjustments"("reverses_adjustment_id");
CREATE INDEX "payment_adjustments_attempt_resolution_idx" ON "payment_adjustments"("payment_attempt_id", "resolution");
CREATE INDEX "payment_adjustments_provider_updated_idx" ON "payment_adjustments"("provider_updated_at");
CREATE UNIQUE INDEX "payment_adjustment_allocations_adjustment_line_key" ON "payment_adjustment_allocations"("payment_adjustment_id", "paid_order_line_id");
CREATE UNIQUE INDEX "transactions_paid_order_line_id_key" ON "transactions"("paid_order_line_id");
CREATE UNIQUE INDEX "transactions_payment_adjustment_allocation_id_key" ON "transactions"("payment_adjustment_allocation_id");

ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paid_order_lines" ADD CONSTRAINT "paid_order_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_reverses_adjustment_id_fkey" FOREIGN KEY ("reverses_adjustment_id") REFERENCES "payment_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustment_allocations" ADD CONSTRAINT "payment_adjustment_allocations_payment_adjustment_id_fkey" FOREIGN KEY ("payment_adjustment_id") REFERENCES "payment_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_adjustment_allocations" ADD CONSTRAINT "payment_adjustment_allocations_paid_order_line_id_fkey" FOREIGN KEY ("paid_order_line_id") REFERENCES "paid_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_paid_order_line_id_fkey" FOREIGN KEY ("paid_order_line_id") REFERENCES "paid_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_adjustment_allocation_id_fkey" FOREIGN KEY ("payment_adjustment_allocation_id") REFERENCES "payment_adjustment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
