/*
  Warnings:

  - A unique constraint covering the columns `[buyer_id,client_request_id]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `client_request_id` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "checkout_session_url" TEXT,
ADD COLUMN     "client_request_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_buyer_client_request_key" ON "orders"("buyer_id", "client_request_id");
