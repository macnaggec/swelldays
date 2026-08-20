-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SurfSessionStatus" AS ENUM ('PUBLISHED', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PHOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "UploadSource" AS ENUM ('LOCAL', 'DRIVE');

-- CreateEnum
CREATE TYPE "UploadAttemptStatus" AS ENUM ('READY', 'ACQUIRING', 'FINALIZING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CLEANUP_PENDING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadWorkspaceKind" AS ENUM ('NEW_SESSION', 'SESSION_EDIT');

-- CreateEnum
CREATE TYPE "UploadWorkspaceStatus" AS ENUM ('ACTIVE', 'SAVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UploadWorkspaceAssetStatus" AS ENUM ('READY', 'PROMOTED', 'CLEANUP_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DELETED', 'DRIVE_PENDING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'PAYOUT', 'FORFEIT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SpotStatus" AS ENUM ('verified', 'unverified');

-- CreateEnum
CREATE TYPE "MediaImportSource" AS ENUM ('DIRECT', 'GOOGLE_DRIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "external_customer_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_items" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'PHOTO',
    "session_id" TEXT NOT NULL,
    "photographer_id" TEXT NOT NULL,
    "spot_id" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "price" INTEGER,
    "lightbox_url" TEXT NOT NULL,
    "cloudinary_public_id" TEXT NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "thumbnail_url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "import_source" "MediaImportSource" NOT NULL DEFAULT 'DIRECT',
    "remote_file_id" TEXT,
    "upload_attempt_id" TEXT,

    CONSTRAINT "media_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DECIMAL(10,8),
    "lng" DECIMAL(11,8),
    "search_radius" INTEGER,
    "status" "SpotStatus" NOT NULL DEFAULT 'verified',
    "creator_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aliases" TEXT[],
    "cover_url" TEXT,

    CONSTRAINT "spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surf_sessions" (
    "id" TEXT NOT NULL,
    "spot_id" TEXT,
    "photographer_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "photo_price" INTEGER NOT NULL DEFAULT 300,
    "video_price" INTEGER NOT NULL DEFAULT 300,
    "status" "SurfSessionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surf_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "surf_sessions_valid_time_window_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" < "ends_at")
);

-- CreateTable
CREATE TABLE "upload_workspaces" (
    "id" TEXT NOT NULL,
    "kind" "UploadWorkspaceKind" NOT NULL,
    "status" "UploadWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "photographer_id" TEXT NOT NULL,
    "target_session_id" TEXT,
    "spot_id" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "photo_price" INTEGER NOT NULL DEFAULT 300,
    "video_price" INTEGER NOT NULL DEFAULT 300,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_workspace_assets" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "photographer_id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL DEFAULT 'PHOTO',
    "cloudinary_public_id" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "lightbox_url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "import_source" "MediaImportSource" NOT NULL DEFAULT 'DIRECT',
    "remote_file_id" TEXT,
    "status" "UploadWorkspaceAssetStatus" NOT NULL DEFAULT 'READY',
    "upload_attempt_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_workspace_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_workspace_media_changes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_workspace_media_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "buyer_id" TEXT,
    "external_order_id" TEXT,
    "total_amount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "guest_email" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "buyer_id" TEXT,
    "amount_paid" INTEGER NOT NULL,
    "platform_fee" INTEGER NOT NULL,
    "photographer_earned" INTEGER NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_item_id" TEXT NOT NULL,
    "order_id" TEXT,
    "preview_url" TEXT,
    "download_token" TEXT,
    "guest_email" TEXT,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "external_order_id" TEXT,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "photographer_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "external_transfer_id" TEXT,
    "note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_spot_covers" (
    "user_id" TEXT NOT NULL,
    "spot_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_spot_covers_pkey" PRIMARY KEY ("user_id","spot_id")
);

-- CreateTable
CREATE TABLE "user_favorite_spots" (
    "user_id" TEXT NOT NULL,
    "spot_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_spots_pkey" PRIMARY KEY ("user_id","spot_id")
);

-- CreateTable
CREATE TABLE "user_favorite_media" (
    "user_id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_media_pkey" PRIMARY KEY ("user_id","media_item_id")
);

-- CreateTable
CREATE TABLE "upload_attempts" (
    "id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "photographer_id" TEXT NOT NULL,
    "source" "UploadSource" NOT NULL,
    "status" "UploadAttemptStatus" NOT NULL DEFAULT 'READY',
    "cloudinary_public_id" TEXT NOT NULL,
    "expected_media_type" "MediaType" NOT NULL,
    "remote_file_id" TEXT,
    "last_error_code" TEXT,
    "upload_grant_expires_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upload_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_items_upload_attempt_id_key" ON "media_items"("upload_attempt_id");

-- CreateIndex
CREATE INDEX "media_items_session_id_idx" ON "media_items"("session_id");

-- CreateIndex
CREATE INDEX "media_items_photographer_status_deleted_created_idx" ON "media_items"("photographer_id", "status", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "media_items_photographer_status_deleted_captured_idx" ON "media_items"("photographer_id", "status", "deleted_at", "captured_at");

-- CreateIndex
CREATE INDEX "media_items_spot_status_deleted_captured_idx" ON "media_items"("spot_id", "status", "deleted_at", "captured_at");

-- CreateIndex
CREATE INDEX "media_items_spot_photographer_status_deleted_created_idx" ON "media_items"("spot_id", "photographer_id", "status", "deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "surf_sessions_status_created_idx" ON "surf_sessions"("status", "created_at");

-- CreateIndex
CREATE INDEX "surf_sessions_spot_status_created_idx" ON "surf_sessions"("spot_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "surf_sessions_photographer_created_idx" ON "surf_sessions"("photographer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "surf_sessions_id_photographer_id_key" ON "surf_sessions"("id", "photographer_id");

-- CreateIndex
CREATE INDEX "upload_workspaces_photographer_status_updated_idx" ON "upload_workspaces"("photographer_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "upload_workspaces_one_active_per_photographer_idx" ON "upload_workspaces"("photographer_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "upload_workspaces_target_session_idx" ON "upload_workspaces"("target_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_workspace_assets_cloudinary_public_id_key" ON "upload_workspace_assets"("cloudinary_public_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_workspace_assets_upload_attempt_id_key" ON "upload_workspace_assets"("upload_attempt_id");

-- CreateIndex
CREATE INDEX "upload_workspace_assets_workspace_status_created_idx" ON "upload_workspace_assets"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "upload_workspace_media_changes_media_item_idx" ON "upload_workspace_media_changes"("media_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "upload_workspace_media_changes_workspace_media_key" ON "upload_workspace_media_changes"("workspace_id", "media_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_external_order_id_key" ON "orders"("external_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_download_token_key" ON "purchases"("download_token");

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_transaction_id_key" ON "payout_requests"("transaction_id");

-- CreateIndex
CREATE INDEX "user_favorite_media_user_created_idx" ON "user_favorite_media"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "upload_attempts_cloudinary_public_id_key" ON "upload_attempts"("cloudinary_public_id");

-- CreateIndex
CREATE INDEX "upload_attempts_workspace_status_idx" ON "upload_attempts"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "upload_attempts_status_expires_idx" ON "upload_attempts"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "upload_attempts_photographer_client_request_key" ON "upload_attempts"("photographer_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_session_id_photographer_id_fkey" FOREIGN KEY ("session_id", "photographer_id") REFERENCES "surf_sessions"("id", "photographer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_upload_attempt_id_fkey" FOREIGN KEY ("upload_attempt_id") REFERENCES "upload_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spots" ADD CONSTRAINT "spots_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surf_sessions" ADD CONSTRAINT "surf_sessions_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surf_sessions" ADD CONSTRAINT "surf_sessions_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspaces" ADD CONSTRAINT "upload_workspaces_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspaces" ADD CONSTRAINT "upload_workspaces_target_session_id_photographer_id_fkey" FOREIGN KEY ("target_session_id", "photographer_id") REFERENCES "surf_sessions"("id", "photographer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspaces" ADD CONSTRAINT "upload_workspaces_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspace_assets" ADD CONSTRAINT "upload_workspace_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "upload_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspace_assets" ADD CONSTRAINT "upload_workspace_assets_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspace_assets" ADD CONSTRAINT "upload_workspace_assets_upload_attempt_id_fkey" FOREIGN KEY ("upload_attempt_id") REFERENCES "upload_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspace_media_changes" ADD CONSTRAINT "upload_workspace_media_changes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "upload_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_workspace_media_changes" ADD CONSTRAINT "upload_workspace_media_changes_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_spot_covers" ADD CONSTRAINT "user_spot_covers_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_spot_covers" ADD CONSTRAINT "user_spot_covers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_spots" ADD CONSTRAINT "user_favorite_spots_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_spots" ADD CONSTRAINT "user_favorite_spots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_media" ADD CONSTRAINT "user_favorite_media_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_media" ADD CONSTRAINT "user_favorite_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_attempts" ADD CONSTRAINT "upload_attempts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "upload_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
