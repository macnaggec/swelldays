-- CreateEnum
CREATE TYPE "PaymentAttemptCreationState" AS ENUM (
  'CREATING',
  'READY',
  'UNKNOWN',
  'DEFINITIVELY_FAILED'
);

-- AlterTable
ALTER TABLE "payment_attempts"
ADD COLUMN "creation_state" "PaymentAttemptCreationState" NOT NULL DEFAULT 'CREATING',
ADD COLUMN "creation_failure_code" TEXT;

-- Existing attempts predate lifecycle tracking. A complete provider binding
-- is resumable; an unbound row has an ambiguous historical outcome.
UPDATE "payment_attempts"
SET "creation_state" = CASE
  WHEN "environment" IS NOT NULL
    AND "provider_transaction_id" IS NOT NULL
    AND "checkout_url" IS NOT NULL
    THEN 'READY'::"PaymentAttemptCreationState"
  ELSE 'UNKNOWN'::"PaymentAttemptCreationState"
END;

-- CreateIndex
CREATE INDEX "payment_attempts_order_state_expiry_idx"
ON "payment_attempts"("order_id", "creation_state", "expires_at");
