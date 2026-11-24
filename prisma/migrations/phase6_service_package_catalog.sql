-- =============================================================================
-- PHASE 6 SAFE ADDITIVE MIGRATION:
-- ServicePackage & ServicePackageInclusion Commercial Product Foundation
-- Target DB: PostgreSQL 18 (smarthome_db)
--
-- Safety Guarantees:
--   - 100% additive DDL (zero table drops, zero column drops, zero row deletions)
--   - Preserves all existing users, profiles, houses, floors, floor_plans, rooms,
--     devices, telemetry, commands, automation_rules, and 3D house_models
--   - Idempotent: safe to re-run
-- =============================================================================

-- 1. Create controlled enums safely
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PackageStatus') THEN
    CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceInclusionCategory') THEN
    CREATE TYPE "ServiceInclusionCategory" AS ENUM (
      'PROPERTY_SURVEY',
      'FLOOR_PLAN_2D',
      'IOT_DEVICE_CONFIGURATION',
      'IOT_DEVICE_INSTALLATION',
      'AUTOMATION_CONFIGURATION',
      'SMART_HOME_DASHBOARD',
      'THREE_D_MODEL',
      'GLB_ASSET_PREPARATION',
      'TRAINING_AND_HANDOVER',
      'OTHER'
    );
  END IF;
END $$;

-- 2. Create service_packages table
CREATE TABLE IF NOT EXISTS "service_packages" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "shortDescription" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "estimatedDuration" TEXT,
  "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "maxRooms" INTEGER,
  "maxDevices" INTEGER,
  "includedAutomations" INTEGER,
  "hasPhysicalIot" BOOLEAN NOT NULL DEFAULT false,
  "hasThreeD" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- Unique index on package code
CREATE UNIQUE INDEX IF NOT EXISTS "service_packages_code_key" ON "service_packages"("code");
CREATE INDEX IF NOT EXISTS "service_packages_status_idx" ON "service_packages"("status");
CREATE INDEX IF NOT EXISTS "service_packages_displayOrder_idx" ON "service_packages"("displayOrder");

-- 3. Create service_package_inclusions table
CREATE TABLE IF NOT EXISTS "service_package_inclusions" (
  "id" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "category" "ServiceInclusionCategory" NOT NULL DEFAULT 'OTHER',
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "isIncluded" BOOLEAN NOT NULL DEFAULT true,
  "quantity" INTEGER,
  "metadata" JSONB,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_package_inclusions_pkey" PRIMARY KEY ("id")
);

-- Foreign key with Cascade delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_package_inclusions_packageId_fkey'
  ) THEN
    ALTER TABLE "service_package_inclusions"
      ADD CONSTRAINT "service_package_inclusions_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "service_package_inclusions_packageId_idx" ON "service_package_inclusions"("packageId");
CREATE INDEX IF NOT EXISTS "service_package_inclusions_category_idx" ON "service_package_inclusions"("category");
