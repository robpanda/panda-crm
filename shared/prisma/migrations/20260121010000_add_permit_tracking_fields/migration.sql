-- Add comprehensive permit tracking fields to opportunities table
-- Based on Project Expeditors Permitting process workflow

-- Add permit status tracking
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_status" TEXT;

-- Add permit timeline fields
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_submitted_date" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_approved_date" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_paid_date" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_received_date" TIMESTAMP(3);

-- Add permit financial fields
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_cost" DECIMAL(10,2);
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_payment_method" TEXT;

-- Add permit reference fields
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_number" TEXT;
ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "permit_notes" TEXT;

-- Comment explaining permit status values
COMMENT ON COLUMN "opportunities"."permit_status" IS 'Permit workflow status: pending, submitted, under_review, approved, paid, received';
COMMENT ON COLUMN "opportunities"."permit_payment_method" IS 'Payment method: cash, check, credit_card, company_paid';
