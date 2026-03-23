-- CreateEnum
CREATE TYPE "CallCenterImportReviewStatus" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateTable
CREATE TABLE "call_center_import_runs" (
    "id" TEXT NOT NULL,
    "preview_token" TEXT NOT NULL,
    "workbook_file_name" TEXT NOT NULL,
    "workbook_sha256" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_by_user_id" TEXT,
    "summary_json" JSONB NOT NULL,
    "alias_map_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_center_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_center_import_review_items" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "source_sheet" TEXT NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "row_fingerprint" TEXT,
    "customer_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "state" TEXT,
    "event_date" TEXT,
    "event_time" TEXT,
    "normalized_disposition" TEXT,
    "warning_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warning_messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "row_data_json" JSONB,
    "user_mappings_json" JSONB,
    "execution_result_json" JSONB,
    "matched_lead_id" TEXT,
    "matched_opportunity_id" TEXT,
    "matched_appointment_id" TEXT,
    "created_lead_id" TEXT,
    "created_opportunity_id" TEXT,
    "created_appointment_id" TEXT,
    "status" "CallCenterImportReviewStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "resolved_by_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_center_import_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_center_import_runs_preview_token_key" ON "call_center_import_runs"("preview_token");

-- CreateIndex
CREATE INDEX "call_center_import_runs_executed_at_idx" ON "call_center_import_runs"("executed_at");

-- CreateIndex
CREATE INDEX "call_center_import_runs_executed_by_user_id_idx" ON "call_center_import_runs"("executed_by_user_id");

-- CreateIndex
CREATE INDEX "call_center_import_review_items_run_id_idx" ON "call_center_import_review_items"("run_id");

-- CreateIndex
CREATE INDEX "call_center_import_review_items_status_idx" ON "call_center_import_review_items"("status");

-- CreateIndex
CREATE INDEX "call_center_import_review_items_resolved_by_user_id_idx" ON "call_center_import_review_items"("resolved_by_user_id");

-- CreateIndex
CREATE INDEX "call_center_import_review_items_created_at_idx" ON "call_center_import_review_items"("created_at");

-- AddForeignKey
ALTER TABLE "call_center_import_runs" ADD CONSTRAINT "call_center_import_runs_executed_by_user_id_fkey" FOREIGN KEY ("executed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_import_review_items" ADD CONSTRAINT "call_center_import_review_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "call_center_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_import_review_items" ADD CONSTRAINT "call_center_import_review_items_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
