-- AlterTable: Make invoice_id optional on payments table
-- This allows Stripe-synced payments to exist without a linked invoice

ALTER TABLE "payments" ALTER COLUMN "invoice_id" DROP NOT NULL;
