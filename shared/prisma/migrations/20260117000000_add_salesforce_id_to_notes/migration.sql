-- Add salesforce_id column to notes table
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "salesforce_id" VARCHAR(255);

-- Add unique constraint on salesforce_id
CREATE UNIQUE INDEX IF NOT EXISTS "notes_salesforce_id_key" ON "notes"("salesforce_id");
