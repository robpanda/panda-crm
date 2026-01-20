-- Claims Onboarding Fields
-- Adds onboarding workflow fields to opportunities table for PandaClaims workflow

-- Onboarding dates and ownership
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS onboarding_start_date TIMESTAMP;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS onboarding_complete_date TIMESTAMP;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS onboarded_by_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS approved_by_id TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS approved_date TIMESTAMP;

-- Document/requirement checkboxes
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS estimate_received BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contract_received BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS photos_collected VARCHAR(50); -- 'pending', 'sufficient', 'insufficient'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS photos_reviewed_date TIMESTAMP;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pre_supplement_required BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS down_payment_received BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS deductible_received BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS financed BOOLEAN DEFAULT FALSE;

-- HOA & Permit fields
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS hoa_required VARCHAR(20); -- 'yes', 'no', 'unknown'
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS hoa_approved BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS permit_required BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS permit_obtained BOOLEAN DEFAULT FALSE;

-- Other requirements
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS solar_dnr_required BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pii_complete BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS not_install_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS not_install_ready_notes TEXT;

-- Create indexes for filtering by onboarding status
CREATE INDEX IF NOT EXISTS idx_opportunities_onboarding_start ON opportunities(onboarding_start_date);
CREATE INDEX IF NOT EXISTS idx_opportunities_photos_collected ON opportunities(photos_collected);
CREATE INDEX IF NOT EXISTS idx_opportunities_is_panda_claims ON opportunities(is_panda_claims);
