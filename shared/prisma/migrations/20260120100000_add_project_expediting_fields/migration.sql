-- Add Project Expediting fields to opportunities table
ALTER TABLE "opportunities" ADD COLUMN "project_expediting_start_date" TIMESTAMP(3);
ALTER TABLE "opportunities" ADD COLUMN "project_expeditor_id" TEXT;
ALTER TABLE "opportunities" ADD COLUMN "project_expeditor_notes" TEXT;
ALTER TABLE "opportunities" ADD COLUMN "veto_install_not_ready" BOOLEAN NOT NULL DEFAULT false;

-- Add Job Complexity fields
ALTER TABLE "opportunities" ADD COLUMN "job_complexity_photos_reviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "opportunities" ADD COLUMN "job_complexity_notes" TEXT;
ALTER TABLE "opportunities" ADD COLUMN "flat_roof" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "opportunities" ADD COLUMN "line_drop" BOOLEAN NOT NULL DEFAULT false;

-- Add Supplement conditional fields
ALTER TABLE "opportunities" ADD COLUMN "supplement_required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "opportunities" ADD COLUMN "supplement_holds_job" BOOLEAN NOT NULL DEFAULT false;

-- Add foreign key constraint for project_expeditor_id
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_expeditor_id_fkey" FOREIGN KEY ("project_expeditor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for project_expeditor_id
CREATE INDEX "opportunities_project_expeditor_id_idx" ON "opportunities"("project_expeditor_id");
