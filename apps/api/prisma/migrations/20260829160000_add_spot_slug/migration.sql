-- Add slug as nullable first so existing rows can be backfilled before the
-- NOT NULL/UNIQUE constraints are enforced below.
ALTER TABLE "spots" ADD COLUMN "slug" TEXT;

-- Backfill: lowercase the name, collapse any run of non-alphanumeric
-- characters into a single hyphen, trim leading/trailing hyphens. Mirrors
-- the slugify() used for new spots at apps/api/src/lib/slugify.ts.
UPDATE "spots"
SET "slug" = regexp_replace(regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g');

-- Resolve collisions among existing rows (e.g. two spots both named
-- "Uluwatu"): the earliest-created row keeps the bare slug, later ones get
-- -2, -3, ... appended, matching the suffix scheme new spots use.
WITH ranked AS (
  SELECT "id", "slug", ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "created_at") AS rn
  FROM "spots"
)
UPDATE "spots" s
SET "slug" = s."slug" || '-' || ranked.rn
FROM ranked
WHERE s."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "spots" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "spots_slug_key" ON "spots"("slug");
