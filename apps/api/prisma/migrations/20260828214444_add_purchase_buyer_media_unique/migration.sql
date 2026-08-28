/*
  Warnings:

  - A unique constraint covering the columns `[buyer_id,media_item_id]` on the table `purchases` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "purchases_buyer_media_key" ON "purchases"("buyer_id", "media_item_id");
