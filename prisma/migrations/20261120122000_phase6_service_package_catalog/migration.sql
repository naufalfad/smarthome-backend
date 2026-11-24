-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ServiceInclusionCategory" AS ENUM ('PROPERTY_SURVEY', 'FLOOR_PLAN_2D', 'IOT_DEVICE_CONFIGURATION', 'IOT_DEVICE_INSTALLATION', 'AUTOMATION_CONFIGURATION', 'SMART_HOME_DASHBOARD', 'THREE_D_MODEL', 'GLB_ASSET_PREPARATION', 'TRAINING_AND_HANDOVER', 'OTHER');

-- CreateTable
CREATE TABLE "service_packages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_package_inclusions" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_package_inclusions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_packages_code_key" ON "service_packages"("code");

-- CreateIndex
CREATE INDEX "service_packages_status_idx" ON "service_packages"("status");

-- CreateIndex
CREATE INDEX "service_packages_displayOrder_idx" ON "service_packages"("displayOrder");

-- CreateIndex
CREATE INDEX "service_package_inclusions_packageId_idx" ON "service_package_inclusions"("packageId");

-- CreateIndex
CREATE INDEX "service_package_inclusions_category_idx" ON "service_package_inclusions"("category");

-- AddForeignKey
ALTER TABLE "service_package_inclusions" ADD CONSTRAINT "service_package_inclusions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "service_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
