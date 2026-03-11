-- Align PhotoReport status defaults with Prisma schema (QUEUED)
-- Safe for reruns and mixed historical states.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'photo_reports'
  ) THEN
    -- Ensure new inserts do not attempt legacy PENDING default.
    ALTER TABLE "photo_reports"
      ALTER COLUMN "status" SET DEFAULT 'QUEUED';

    -- In case legacy records were written as text-like status values.
    UPDATE "photo_reports"
      SET "status" = 'QUEUED'
      WHERE "status"::text = 'PENDING';
  END IF;
END $$;
