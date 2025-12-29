-- Move Service Request fields from Account to Opportunity
-- Per Panda CRM architecture: everything lives on the Job (Opportunity) Hub

-- Step 1: Add new columns to opportunities table
ALTER TABLE "opportunities" ADD COLUMN "service_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "opportunities" ADD COLUMN "service_complete" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "opportunities" ADD COLUMN "service_request_date" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN "service_notes" TEXT;
ALTER TABLE "opportunities" ADD COLUMN "project_manager_id" TEXT;

-- Step 2: Add foreign key for project_manager_id
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_manager_id_fkey"
  FOREIGN KEY ("project_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: Add index for project_manager_id
CREATE INDEX "opportunities_project_manager_id_idx" ON "opportunities"("project_manager_id");

-- Step 4: Migrate existing data from accounts to primary opportunities
-- This copies service request data from accounts to their primary (first) opportunity
UPDATE "opportunities" opp
SET
  "service_required" = acc."service_required",
  "service_complete" = acc."service_complete",
  "service_request_date" = acc."service_request_date",
  "service_notes" = acc."service_notes",
  "project_manager_id" = acc."project_manager_id"
FROM "accounts" acc
WHERE opp."account_id" = acc."id"
  AND acc."service_required" = true
  AND opp."id" = (
    SELECT o2."id" FROM "opportunities" o2
    WHERE o2."account_id" = acc."id"
    ORDER BY o2."created_at" DESC
    LIMIT 1
  );

-- Step 5: Remove columns from accounts table
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_project_manager_id_fkey";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "service_required";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "service_complete";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "service_request_date";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "service_notes";
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "project_manager_id";
