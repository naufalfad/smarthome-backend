-- =============================================================================
-- PHASE 3 SAFE ADDITIVE MIGRATION:
-- CustomerProfile, TechnicianProfile & Multi-Property Ownership (House.customerId)
-- Target DB: PostgreSQL 18 (smarthome_db)
--
-- Safety Guarantees:
--   - 100% additive DDL (zero table drops, zero column drops, zero row deletions)
--   - Preserves all existing users, houses, floors, floor_plans, rooms, devices,
--     telemetry, commands, automation_rules, and 3D house_models
--   - Does NOT auto-mark existing houses as ACTIVE
--   - Retains legacy users."houseId" temporarily as deprecated non-authoritative field
--   - Idempotent: safe to re-run
-- =============================================================================

-- 1. Create controlled enums safely (idempotent DO blocks)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TechnicianAvailabilityStatus') THEN
    CREATE TYPE "TechnicianAvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'INACTIVE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropertyType') THEN
    CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOPHOUSE', 'OTHER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PropertySetupStatus') THEN
    CREATE TYPE "PropertySetupStatus" AS ENUM (
      'DRAFT',
      'SURVEYING',
      'CONFIGURING',
      'TESTING',
      'READY_FOR_HANDOVER',
      'ACTIVE',
      'ARCHIVED'
    );
  END IF;
END $$;

-- 2. Create customer_profiles table (1:1 with CUSTOMER User)
CREATE TABLE IF NOT EXISTS "customer_profiles" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "fullName"       TEXT NOT NULL,
  "phone"          TEXT,
  "billingAddress" TEXT,
  "companyName"    TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- 3. Create technician_profiles table (1:1 with TECHNICIAN User)
CREATE TABLE IF NOT EXISTS "technician_profiles" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "employeeCode"       TEXT,
  "specialization"     TEXT,
  "serviceArea"        TEXT,
  "availabilityStatus" "TechnicianAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "technician_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "technician_profiles_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "technician_profiles_userId_key" ON "technician_profiles"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "technician_profiles_employeeCode_key" ON "technician_profiles"("employeeCode");
CREATE INDEX IF NOT EXISTS "technician_profiles_availabilityStatus_idx" ON "technician_profiles"("availabilityStatus");

-- 4. Evolve existing houses table into Customer-owned Property (1:N)
ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "address"        TEXT;
ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "propertyType"   "PropertyType" NOT NULL DEFAULT 'HOUSE';
ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "hasPhysicalIot" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "setupStatus"    "PropertySetupStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "houses" ADD COLUMN IF NOT EXISTS "customerId"     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'houses_customerId_fkey'
  ) THEN
    ALTER TABLE "houses"
      ADD CONSTRAINT "houses_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "houses_customerId_idx" ON "houses"("customerId");
CREATE INDEX IF NOT EXISTS "houses_setupStatus_idx" ON "houses"("setupStatus");
