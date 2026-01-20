-- Add invoice_date column to accounts table
-- This column tracks when an account's invoice was issued
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "invoice_date" TIMESTAMP;
