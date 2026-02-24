-- Add cadence-related columns to existing tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source VARCHAR(64) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cadence_rule VARCHAR(64);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;

-- Partial index for assigned user's pending tasks ordered by due date
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_due_pending
  ON tasks(assigned_to, due_at) WHERE status = 'PENDING';
