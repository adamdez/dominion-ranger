-- Phase 3.6: Add DISCONNECTED disposition type for dial cockpit
-- Additive only — ALTER TYPE ADD VALUE

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'disposition_type' AND e.enumlabel = 'DISCONNECTED'
  ) THEN
    ALTER TYPE disposition_type ADD VALUE 'DISCONNECTED';
  END IF;
END
$$;
