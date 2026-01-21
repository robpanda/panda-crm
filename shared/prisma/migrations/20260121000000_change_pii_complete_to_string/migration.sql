-- Change pii_complete from Boolean to String to support 'yes', 'no', 'not_required' values
-- First, drop the default constraint and change the column type

-- Convert existing boolean values to string equivalents
-- true -> 'yes', false -> null (unset)
ALTER TABLE "opportunities"
  ALTER COLUMN "pii_complete" TYPE TEXT
  USING CASE WHEN "pii_complete" = true THEN 'yes' ELSE NULL END;

-- Remove the default constraint (was @default(false))
ALTER TABLE "opportunities" ALTER COLUMN "pii_complete" DROP DEFAULT;
