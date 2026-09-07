-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_amount_cents" INTEGER,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "seller_id" TEXT,
ADD COLUMN     "fee_policy_version" TEXT,
ADD COLUMN     "platform_fee_amount" INTEGER,
ADD COLUMN     "seller_earnings_amount" INTEGER,
ADD COLUMN     "deliverable_type" "MediaType",
ADD COLUMN     "deliverable_public_id" TEXT;
