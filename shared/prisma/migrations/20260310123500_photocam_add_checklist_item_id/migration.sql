-- Add missing PhotoCam checklist pointer column (additive safe migration)

ALTER TABLE "photos"
  ADD COLUMN IF NOT EXISTS "checklist_item_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photos_checklist_item_id_fkey') THEN
    ALTER TABLE "photos"
      ADD CONSTRAINT "photos_checklist_item_id_fkey"
      FOREIGN KEY ("checklist_item_id") REFERENCES "photo_checklist_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "photos_checklist_item_id_idx" ON "photos" ("checklist_item_id");
