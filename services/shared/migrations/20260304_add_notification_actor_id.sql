-- Add actor tracking for notification outbox and mention auditing.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS actor_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_actor_id_fkey'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_actor_id_created_at_idx
  ON notifications(actor_id, created_at DESC);
