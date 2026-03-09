-- Add task linkage for result appointment wizard virtual follow-up support.
ALTER TABLE "appointment_results"
ADD COLUMN IF NOT EXISTS "task_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointment_results_task_id_fkey'
  ) THEN
    ALTER TABLE "appointment_results"
    ADD CONSTRAINT "appointment_results_task_id_fkey"
    FOREIGN KEY ("task_id")
    REFERENCES "tasks"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "appointment_results_task_id_idx"
ON "appointment_results"("task_id");
