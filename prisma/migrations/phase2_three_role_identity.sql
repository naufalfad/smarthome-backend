-- =============================================================================
-- PHASE 2 SAFE NON-DESTRUCTIVE MIGRATION: THREE-ROLE IDENTITY MODEL
-- Target DB: PostgreSQL 18 (smarthome_db)
--
-- Safety Guarantees:
--   - Zero table drops, zero resets, zero row deletions
--   - Preserves existing 'admin' (promoted in-place to SUPER_ADMIN) & password hash
--   - Preserves existing 'penghuni' (mapped in-place to CUSTOMER) & password hash
--   - Idempotent: safe to re-run without error
-- =============================================================================

-- 1. Safely rename legacy enum values in-place (PostgreSQL 10+)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'ADMIN'
  ) THEN
    ALTER TYPE "UserRole" RENAME VALUE 'ADMIN' TO 'SUPER_ADMIN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'RESIDENT'
  ) THEN
    ALTER TYPE "UserRole" RENAME VALUE 'RESIDENT' TO 'CUSTOMER';
  END IF;
END $$;

-- 2. Add TECHNICIAN role to UserRole enum (must execute outside DO block in some PG versions if used immediately)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TECHNICIAN';

-- 3. Make username nullable for email-only Customer accounts (preserves existing unique index)
ALTER TABLE "users" ALTER COLUMN "username" DROP NOT NULL;

-- 4. Add new identity & account-state columns (additive, non-destructive)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- 5. Normalize any pre-existing non-null email values to lowercase trimmed (safe no-op if all NULL)
UPDATE "users"
SET "email" = LOWER(TRIM("email"))
WHERE "email" IS NOT NULL AND "email" <> LOWER(TRIM("email"));

-- 6. Ensure unique email constraint & active-state index
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_isActive_idx" ON "users"("isActive");
