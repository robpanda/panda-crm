-- Add Call Center fields to Leads table
-- These support the Setting A Lead SOP and Call Center Dashboard

-- Tentative appointment tracking
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tentative_appointment_date" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tentative_appointment_time" TEXT;

-- Lead Set By tracking (the call center rep who set/confirmed the lead)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lead_set_by_id" TEXT;

-- Add foreign key for lead_set_by_id
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_set_by_id_fkey"
  FOREIGN KEY ("lead_set_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for performance on call center queries
CREATE INDEX IF NOT EXISTS "leads_tentative_appointment_date_idx" ON "leads"("tentative_appointment_date");
CREATE INDEX IF NOT EXISTS "leads_lead_set_by_id_idx" ON "leads"("lead_set_by_id");
