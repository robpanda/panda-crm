-- Add disposition tracking fields to opportunities
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "current_disposition_category" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "current_disposition_reason" TEXT;

-- Create appointment_results audit table
CREATE TABLE IF NOT EXISTS "appointment_results" (
  "id" TEXT PRIMARY KEY,
  "opportunity_id" TEXT NOT NULL,
  "appointment_id" TEXT,
  "payload" JSONB NOT NULL,
  "disposition_category" TEXT NOT NULL,
  "disposition_reason" TEXT,
  "follow_up_at" TIMESTAMP(3),
  "insurance_company" TEXT,
  "claim_number" TEXT,
  "claim_filed_date" TIMESTAMP(3),
  "date_of_loss" TIMESTAMP(3),
  "damage_location" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS "appointment_results_opportunity_id_idx" ON "appointment_results" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "appointment_results_created_at_idx" ON "appointment_results" ("created_at");

-- Foreign keys
ALTER TABLE "appointment_results"
  ADD CONSTRAINT "appointment_results_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id") REFERENCES "opportunities" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointment_results"
  ADD CONSTRAINT "appointment_results_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
