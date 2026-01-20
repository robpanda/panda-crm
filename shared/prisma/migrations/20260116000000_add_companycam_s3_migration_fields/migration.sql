-- Add S3 migration tracking fields to companycam_photos table
ALTER TABLE "companycam_photos" ADD COLUMN IF NOT EXISTS "s3_key" TEXT;
ALTER TABLE "companycam_photos" ADD COLUMN IF NOT EXISTS "s3_thumbnail_key" TEXT;
ALTER TABLE "companycam_photos" ADD COLUMN IF NOT EXISTS "original_companycam_url" TEXT;
ALTER TABLE "companycam_photos" ADD COLUMN IF NOT EXISTS "migrated_to_s3" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "companycam_photos" ADD COLUMN IF NOT EXISTS "migrated_at" TIMESTAMP(3);

-- Add index for migration tracking queries
CREATE INDEX IF NOT EXISTS "companycam_photos_migrated_to_s3_idx" ON "companycam_photos"("migrated_to_s3");

-- Add external source tracking fields to photos table
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "external_id" TEXT;
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "external_source" TEXT;

-- Add index for external source lookups
CREATE INDEX IF NOT EXISTS "photos_external_id_idx" ON "photos"("external_id");
CREATE INDEX IF NOT EXISTS "photos_external_source_idx" ON "photos"("external_source");
