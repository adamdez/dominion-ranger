-- Add new task types for nurture cadence
-- Additive only. Safe to re-run.

ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'SEND_MAILER';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'SEND_EMAIL';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'SEND_SMS';
ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'NURTURE_CALL';
