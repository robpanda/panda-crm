ALTER TABLE "accounts"
ADD COLUMN "call_center_import_run_id" TEXT;

ALTER TABLE "contacts"
ADD COLUMN "call_center_import_run_id" TEXT;

ALTER TABLE "leads"
ADD COLUMN "call_center_import_run_id" TEXT;

ALTER TABLE "opportunities"
ADD COLUMN "call_center_import_run_id" TEXT;

ALTER TABLE "work_orders"
ADD COLUMN "call_center_import_run_id" TEXT;

ALTER TABLE "service_appointments"
ADD COLUMN "call_center_import_run_id" TEXT;

CREATE INDEX "accounts_call_center_import_run_id_idx"
ON "accounts"("call_center_import_run_id");

CREATE INDEX "contacts_call_center_import_run_id_idx"
ON "contacts"("call_center_import_run_id");

CREATE INDEX "leads_call_center_import_run_id_idx"
ON "leads"("call_center_import_run_id");

CREATE INDEX "opportunities_call_center_import_run_id_idx"
ON "opportunities"("call_center_import_run_id");

CREATE INDEX "work_orders_call_center_import_run_id_idx"
ON "work_orders"("call_center_import_run_id");

CREATE INDEX "service_appointments_call_center_import_run_id_idx"
ON "service_appointments"("call_center_import_run_id");

ALTER TABLE "accounts"
ADD CONSTRAINT "accounts_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contacts"
ADD CONSTRAINT "contacts_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads"
ADD CONSTRAINT "leads_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "opportunities"
ADD CONSTRAINT "opportunities_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "work_orders"
ADD CONSTRAINT "work_orders_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_appointments"
ADD CONSTRAINT "service_appointments_call_center_import_run_id_fkey"
FOREIGN KEY ("call_center_import_run_id") REFERENCES "call_center_import_runs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
