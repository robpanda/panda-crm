-- Additive claim adjuster fields for opportunities/job claim information
-- Safe for repeated execution in production

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "adjuster_name" TEXT;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "adjuster_email" TEXT;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "adjuster_office_phone" TEXT;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "field_adjuster_mobile" TEXT;

CREATE INDEX IF NOT EXISTS "opportunities_adjuster_name_idx"
  ON "opportunities" ("adjuster_name");

CREATE INDEX IF NOT EXISTS "opportunities_adjuster_email_idx"
  ON "opportunities" ("adjuster_email");
