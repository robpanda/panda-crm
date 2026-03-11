-- PhotoCam V2 Sprint 1 foundation (additive only)

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhotoTemplateType') THEN
    CREATE TYPE "PhotoTemplateType" AS ENUM ('CHECKLIST', 'REPORT');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhotoReportStatus') THEN
    CREATE TYPE "PhotoReportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PhotoExportStatus') THEN
    CREATE TYPE "PhotoExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');
  END IF;
END $$;

-- photos: metadata extensions
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "photos" ADD COLUMN IF NOT EXISTS "customer_visible" BOOLEAN NOT NULL DEFAULT false;

-- checklist_templates: typed templates + PandaPhoto controls
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "template_type" "PhotoTemplateType" NOT NULL DEFAULT 'CHECKLIST';
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "is_published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "panda_photo_only" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "company_scope" TEXT;
ALTER TABLE "checklist_templates" ADD COLUMN IF NOT EXISTS "config_json" JSONB;

-- photo_checklist_items: stronger completion/enforcement rules
ALTER TABLE "photo_checklist_items" ADD COLUMN IF NOT EXISTS "min_photo_count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "photo_checklist_items" ADD COLUMN IF NOT EXISTS "notes_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "photo_checklist_items" ADD COLUMN IF NOT EXISTS "gps_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "photo_checklist_items" ADD COLUMN IF NOT EXISTS "timestamp_required" BOOLEAN NOT NULL DEFAULT false;

-- photo_galleries: portal sharing controls
ALTER TABLE "photo_galleries" ADD COLUMN IF NOT EXISTS "is_portal_visible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "photo_galleries" ADD COLUMN IF NOT EXISTS "last_viewed_at" TIMESTAMP(3);

-- photo reports
CREATE TABLE IF NOT EXISTS "photo_reports" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "template_id" TEXT,
  "project_id" TEXT,
  "opportunity_id" TEXT,
  "status" "PhotoReportStatus" NOT NULL DEFAULT 'QUEUED',
  "report_config" JSONB,
  "file_key" TEXT,
  "file_url" TEXT,
  "generated_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "photo_report_items" (
  "id" TEXT PRIMARY KEY,
  "report_id" TEXT NOT NULL,
  "photo_id" TEXT,
  "checklist_item_id" TEXT,
  "section_key" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "photo_export_jobs" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT,
  "opportunity_id" TEXT,
  "output_format" TEXT NOT NULL,
  "status" "PhotoExportStatus" NOT NULL DEFAULT 'PENDING',
  "request_json" JSONB NOT NULL,
  "file_key" TEXT,
  "file_url" TEXT,
  "expires_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign keys (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_reports_template_id_fkey') THEN
    ALTER TABLE "photo_reports"
      ADD CONSTRAINT "photo_reports_template_id_fkey"
      FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_reports_project_id_fkey') THEN
    ALTER TABLE "photo_reports"
      ADD CONSTRAINT "photo_reports_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "photo_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_reports_created_by_id_fkey') THEN
    ALTER TABLE "photo_reports"
      ADD CONSTRAINT "photo_reports_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_report_items_report_id_fkey') THEN
    ALTER TABLE "photo_report_items"
      ADD CONSTRAINT "photo_report_items_report_id_fkey"
      FOREIGN KEY ("report_id") REFERENCES "photo_reports"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_report_items_photo_id_fkey') THEN
    ALTER TABLE "photo_report_items"
      ADD CONSTRAINT "photo_report_items_photo_id_fkey"
      FOREIGN KEY ("photo_id") REFERENCES "photos"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_export_jobs_project_id_fkey') THEN
    ALTER TABLE "photo_export_jobs"
      ADD CONSTRAINT "photo_export_jobs_project_id_fkey"
      FOREIGN KEY ("project_id") REFERENCES "photo_projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_export_jobs_created_by_id_fkey') THEN
    ALTER TABLE "photo_export_jobs"
      ADD CONSTRAINT "photo_export_jobs_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "photo_reports_template_id_idx" ON "photo_reports" ("template_id");
CREATE INDEX IF NOT EXISTS "photo_reports_project_id_idx" ON "photo_reports" ("project_id");
CREATE INDEX IF NOT EXISTS "photo_reports_opportunity_id_idx" ON "photo_reports" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "photo_reports_status_idx" ON "photo_reports" ("status");

CREATE INDEX IF NOT EXISTS "photo_report_items_report_id_idx" ON "photo_report_items" ("report_id");
CREATE INDEX IF NOT EXISTS "photo_report_items_photo_id_idx" ON "photo_report_items" ("photo_id");
CREATE INDEX IF NOT EXISTS "photo_report_items_checklist_item_id_idx" ON "photo_report_items" ("checklist_item_id");

CREATE INDEX IF NOT EXISTS "photo_export_jobs_project_id_idx" ON "photo_export_jobs" ("project_id");
CREATE INDEX IF NOT EXISTS "photo_export_jobs_opportunity_id_idx" ON "photo_export_jobs" ("opportunity_id");
CREATE INDEX IF NOT EXISTS "photo_export_jobs_status_idx" ON "photo_export_jobs" ("status");
