-- CreateEnum (only if not exists)
DO $$ BEGIN
    CREATE TYPE "MeasurementProvider" AS ENUM ('EAGLEVIEW', 'GAF_QUICKMEASURE', 'ROOFSNAP', 'HOVER', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ReportType" AS ENUM ('BASIC', 'PREMIUM', 'ULTRA_PREMIUM', 'COMMERCIAL', 'WALLS_ONLY', 'ROOF_AND_WALLS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "RoofComplexity" AS ENUM ('SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE "measurement_reports" (
    "id" TEXT NOT NULL,
    "external_id" TEXT,
    "provider" "MeasurementProvider" NOT NULL DEFAULT 'EAGLEVIEW',
    "order_number" TEXT,
    "order_status" TEXT,
    "report_type" "ReportType" NOT NULL DEFAULT 'PREMIUM',
    "report_url" TEXT,
    "report_pdf_url" TEXT,
    "report_xml_url" TEXT,
    "report_json_url" TEXT,
    "property_address" TEXT NOT NULL,
    "property_city" TEXT,
    "property_state" TEXT,
    "property_zip" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "total_roof_area" DOUBLE PRECISION,
    "total_roof_squares" DOUBLE PRECISION,
    "predominant_pitch" TEXT,
    "pitches" JSONB,
    "facets" INTEGER,
    "ridge_length" DOUBLE PRECISION,
    "hip_length" DOUBLE PRECISION,
    "valley_length" DOUBLE PRECISION,
    "rake_length" DOUBLE PRECISION,
    "eave_length" DOUBLE PRECISION,
    "flashing_length" DOUBLE PRECISION,
    "step_flashing_length" DOUBLE PRECISION,
    "drip_edge_length" DOUBLE PRECISION,
    "structure_type" TEXT,
    "stories" INTEGER,
    "building_height" DOUBLE PRECISION,
    "roof_complexity" "RoofComplexity",
    "total_siding_area" DOUBLE PRECISION,
    "siding_walls" JSONB,
    "total_gutter_length" DOUBLE PRECISION,
    "downspout_count" INTEGER,
    "window_count" INTEGER,
    "door_count" INTEGER,
    "skylight_count" INTEGER,
    "suggested_waste_factor" DOUBLE PRECISION,
    "notes" TEXT,
    "capture_link" TEXT,
    "model_viewer_url" TEXT,
    "design_viewer_url" TEXT,
    "raw_data" JSONB,
    "opportunity_id" TEXT NOT NULL,
    "account_id" TEXT,
    "ordered_by_id" TEXT,
    "ordered_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "measurement_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "api_key" TEXT,
    "client_id" TEXT,
    "client_secret" TEXT,
    "webhook_secret" TEXT,
    "webhook_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurement_reports_external_id_key" ON "measurement_reports"("external_id");

-- CreateIndex
CREATE INDEX "measurement_reports_external_id_idx" ON "measurement_reports"("external_id");

-- CreateIndex
CREATE INDEX "measurement_reports_opportunity_id_idx" ON "measurement_reports"("opportunity_id");

-- CreateIndex
CREATE INDEX "measurement_reports_account_id_idx" ON "measurement_reports"("account_id");

-- CreateIndex
CREATE INDEX "measurement_reports_provider_idx" ON "measurement_reports"("provider");

-- CreateIndex
CREATE INDEX "measurement_reports_order_status_idx" ON "measurement_reports"("order_status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_provider_key" ON "integration_credentials"("provider");

-- CreateIndex
CREATE INDEX "integration_credentials_provider_idx" ON "integration_credentials"("provider");

-- CreateIndex
CREATE INDEX "integration_credentials_is_active_idx" ON "integration_credentials"("is_active");

-- AddForeignKey
ALTER TABLE "measurement_reports" ADD CONSTRAINT "measurement_reports_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_reports" ADD CONSTRAINT "measurement_reports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurement_reports" ADD CONSTRAINT "measurement_reports_ordered_by_id_fkey" FOREIGN KEY ("ordered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
