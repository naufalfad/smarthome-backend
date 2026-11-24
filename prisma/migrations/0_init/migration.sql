-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IdentificationStatus" AS ENUM ('UNIDENTIFIED', 'SUGGESTED', 'IDENTIFIED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "IdentifiedNodeType" AS ENUM ('ROOM', 'OBJECT', 'ANCHOR');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'DINING_ROOM', 'WORKSPACE', 'GARAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOPHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertySetupStatus" AS ENUM ('DRAFT', 'SURVEYING', 'CONFIGURING', 'TESTING', 'READY_FOR_HANDOVER', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'TECHNICIAN', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "TechnicianAvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'ON_LEAVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "house_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'model/gltf-binary',
    "thumbnailPath" TEXT,
    "status" "ModelStatus" NOT NULL DEFAULT 'DRAFT',
    "modelMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_identifications" (
    "id" TEXT NOT NULL,
    "houseModelId" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "stableId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "nodeType" "IdentifiedNodeType" NOT NULL,
    "category" TEXT NOT NULL,
    "suggestedCategory" TEXT,
    "status" "IdentificationStatus" NOT NULL DEFAULT 'SUGGESTED',
    "parentRoom" TEXT,
    "parentFloor" TEXT,
    "description" TEXT,
    "revalidationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_identifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "houseModelId" TEXT,
    "floorId" TEXT,
    "name" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'OTHER',
    "floor" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT,
    "polygonCoordinates" JSONB,
    "areaSquareMeters" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIGHT',
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "integrationStatus" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "normalizedX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "normalizedY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "iconWidth" DOUBLE PRECISION NOT NULL DEFAULT 48,
    "iconHeight" DOUBLE PRECISION NOT NULL DEFAULT 48,
    "manualRoomName" TEXT,
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "providerType" TEXT NOT NULL DEFAULT 'VIRTUAL',
    "providerConfig" JSONB,
    "connectionStatus" TEXT NOT NULL DEFAULT 'ONLINE',
    "lastSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "houseId" TEXT,
    "floorId" TEXT,
    "floorPlanId" TEXT,
    "roomId" TEXT,
    "catalogItemId" TEXT,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_catalog_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT NOT NULL,
    "color" TEXT DEFAULT '#8B5CF6',
    "defaultWidth" DOUBLE PRECISION NOT NULL DEFAULT 48,
    "defaultHeight" DOUBLE PRECISION NOT NULL DEFAULT 48,
    "capabilities" JSONB NOT NULL,
    "defaultConfiguration" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_telemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricType" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "stringValue" TEXT,
    "data" JSONB,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "providerType" TEXT DEFAULT 'VIRTUAL',

    CONSTRAINT "device_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "executionResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "propertyType" "PropertyType" NOT NULL DEFAULT 'HOUSE',
    "hasPhysicalIot" BOOLEAN NOT NULL DEFAULT true,
    "setupStatus" "PropertySetupStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "publishStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "houseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "levelNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plans" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Main Floor Plan',
    "imagePath" TEXT,
    "imageWidth" DOUBLE PRECISION,
    "imageHeight" DOUBLE PRECISION,
    "imageSize" INTEGER,
    "imageMimeType" TEXT,
    "pixelsPerMeter" DOUBLE PRECISION,
    "isCalibrated" BOOLEAN NOT NULL DEFAULT false,
    "calibrationPoints" JSONB,
    "viewBoxX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewBoxY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewBoxWidth" DOUBLE PRECISION NOT NULL DEFAULT 1600,
    "viewBoxHeight" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "backgroundOpacity" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isBackgroundVisible" BOOLEAN NOT NULL DEFAULT true,
    "publishStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_catalog_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "svgContent" TEXT,
    "defaultWidth" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "defaultHeight" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "object_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floor_plan_objects" (
    "id" TEXT NOT NULL,
    "floorPlanId" TEXT NOT NULL,
    "catalogObjectId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zIndex" INTEGER NOT NULL DEFAULT 1,
    "roomId" TEXT,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_plan_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" TEXT NOT NULL,
    "houseId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "triggerType" TEXT NOT NULL DEFAULT 'SENSOR',
    "triggerMode" TEXT NOT NULL DEFAULT 'WHEN_CONDITION_BECOMES_TRUE',
    "conditionOperator" TEXT NOT NULL DEFAULT 'ALL',
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 60,
    "lastTriggeredAt" TIMESTAMP(3),
    "lastExecutionStatus" TEXT,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "triggerData" JSONB,
    "executionResult" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "houseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "billingAddress" TEXT,
    "companyName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "specialization" TEXT,
    "serviceArea" TEXT,
    "availabilityStatus" "TechnicianAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technician_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "node_identifications_houseModelId_nodeType_idx" ON "node_identifications"("houseModelId", "nodeType");

-- CreateIndex
CREATE INDEX "node_identifications_houseModelId_status_idx" ON "node_identifications"("houseModelId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "node_identifications_houseModelId_nodeName_key" ON "node_identifications"("houseModelId", "nodeName");

-- CreateIndex
CREATE INDEX "rooms_floorId_idx" ON "rooms"("floorId");

-- CreateIndex
CREATE INDEX "devices_houseId_idx" ON "devices"("houseId");

-- CreateIndex
CREATE INDEX "devices_floorId_idx" ON "devices"("floorId");

-- CreateIndex
CREATE INDEX "devices_floorPlanId_idx" ON "devices"("floorPlanId");

-- CreateIndex
CREATE INDEX "devices_roomId_idx" ON "devices"("roomId");

-- CreateIndex
CREATE INDEX "devices_catalogItemId_idx" ON "devices"("catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "device_catalog_items_deviceType_key" ON "device_catalog_items"("deviceType");

-- CreateIndex
CREATE INDEX "device_catalog_items_category_idx" ON "device_catalog_items"("category");

-- CreateIndex
CREATE INDEX "device_catalog_items_isActive_idx" ON "device_catalog_items"("isActive");

-- CreateIndex
CREATE INDEX "device_telemetry_deviceId_timestamp_idx" ON "device_telemetry"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "device_telemetry_deviceId_metricType_idx" ON "device_telemetry"("deviceId", "metricType");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_createdAt_idx" ON "device_commands"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_status_idx" ON "device_commands"("deviceId", "status");

-- CreateIndex
CREATE INDEX "houses_customerId_idx" ON "houses"("customerId");

-- CreateIndex
CREATE INDEX "houses_setupStatus_idx" ON "houses"("setupStatus");

-- CreateIndex
CREATE UNIQUE INDEX "floors_houseId_levelNumber_key" ON "floors"("houseId", "levelNumber");

-- CreateIndex
CREATE UNIQUE INDEX "floor_plans_floorId_key" ON "floor_plans"("floorId");

-- CreateIndex
CREATE INDEX "object_catalog_items_category_idx" ON "object_catalog_items"("category");

-- CreateIndex
CREATE INDEX "floor_plan_objects_floorPlanId_idx" ON "floor_plan_objects"("floorPlanId");

-- CreateIndex
CREATE INDEX "floor_plan_objects_category_idx" ON "floor_plan_objects"("category");

-- CreateIndex
CREATE INDEX "automation_rules_houseId_idx" ON "automation_rules"("houseId");

-- CreateIndex
CREATE INDEX "automation_rules_enabled_idx" ON "automation_rules"("enabled");

-- CreateIndex
CREATE INDEX "automation_executions_ruleId_idx" ON "automation_executions"("ruleId");

-- CreateIndex
CREATE INDEX "automation_executions_status_idx" ON "automation_executions"("status");

-- CreateIndex
CREATE INDEX "automation_executions_startedAt_idx" ON "automation_executions"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_houseId_idx" ON "users"("houseId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_userId_key" ON "customer_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "technician_profiles_userId_key" ON "technician_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "technician_profiles_employeeCode_key" ON "technician_profiles"("employeeCode");

-- CreateIndex
CREATE INDEX "technician_profiles_availabilityStatus_idx" ON "technician_profiles"("availabilityStatus");

-- AddForeignKey
ALTER TABLE "node_identifications" ADD CONSTRAINT "node_identifications_houseModelId_fkey" FOREIGN KEY ("houseModelId") REFERENCES "house_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_houseModelId_fkey" FOREIGN KEY ("houseModelId") REFERENCES "house_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "device_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_telemetry" ADD CONSTRAINT "device_telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plans" ADD CONSTRAINT "floor_plans_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_objects" ADD CONSTRAINT "floor_plan_objects_floorPlanId_fkey" FOREIGN KEY ("floorPlanId") REFERENCES "floor_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_objects" ADD CONSTRAINT "floor_plan_objects_catalogObjectId_fkey" FOREIGN KEY ("catalogObjectId") REFERENCES "object_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floor_plan_objects" ADD CONSTRAINT "floor_plan_objects_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_profiles" ADD CONSTRAINT "technician_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
