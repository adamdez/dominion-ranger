CREATE TABLE IF NOT EXISTS notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(128),
  title VARCHAR(256) NOT NULL,
  body TEXT,
  type VARCHAR(64) NOT NULL DEFAULT 'INFO',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE error_log ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE error_log ADD COLUMN IF NOT EXISTS error_stack TEXT;

UPDATE error_log
SET
  error_message = COALESCE(error_message, message),
  error_stack = COALESCE(error_stack, stack)
WHERE error_message IS NULL OR error_stack IS NULL;
