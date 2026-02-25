-- Additive migration: password reset token columns for forgot-password flow
-- Do not run drizzle-kit push. Apply this SQL manually or via migration runner.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
