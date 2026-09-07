-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('mock', 'cryptocloud', 'paddle');

-- CreateEnum
CREATE TYPE "PaymentEnvironment" AS ENUM ('test', 'sandbox', 'production');

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "environment" "PaymentEnvironment",
    "provider_transaction_id" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "expected_amount_cents" INTEGER NOT NULL,
    "expected_currency" TEXT NOT NULL,
    "provider_test_mode" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_idx" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_environment_transaction_key"
ON "payment_attempts"("provider", "environment", "provider_transaction_id");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
