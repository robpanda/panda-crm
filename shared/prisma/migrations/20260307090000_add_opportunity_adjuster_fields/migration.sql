-- Add insurance adjuster fields to opportunities (idempotent)
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "adjuster_name" VARCHAR(255);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "adjuster_email" VARCHAR(255);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "adjuster_office_phone" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "adjuster_office_phone_ext" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "field_adjuster_mobile" TEXT;
