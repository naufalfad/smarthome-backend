-- CreateEnum
CREATE TYPE "FieldSurveyStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REVISION_REQUIRED');

-- CreateEnum
CREATE TYPE "SurveyPhotoCategory" AS ENUM ('MAIN_PANEL', 'SUB_PANEL', 'ELECTRICITY_METER', 'ROUTER_WIFI', 'ROOM_OVERVIEW', 'WALL_OUTLET', 'CEILING_OBSTACLE', 'OTHER');

-- CreateTable
CREATE TABLE "field_surveys" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "technicianProfileId" TEXT NOT NULL,
    "status" "FieldSurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledDate" TIMESTAMP(3),
    "surveyedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "buildingType" TEXT,
    "totalFloors" INTEGER NOT NULL DEFAULT 1,
    "estimatedAreaM2" DECIMAL(8,2),
    "wallStructureMaterial" TEXT,
    "ceilingHeightMeters" DECIMAL(4,2),
    "mainBreakerAmps" INTEGER,
    "mainsVoltageVolts" DECIMAL(5,1),
    "groundingStatus" TEXT,
    "hasSubPanels" BOOLEAN NOT NULL DEFAULT false,
    "subPanelLocations" TEXT,
    "electricalNotes" TEXT,
    "ispProvider" TEXT,
    "connectionType" TEXT,
    "measuredDownloadSpeed" DECIMAL(6,2),
    "measuredUploadSpeed" DECIMAL(6,2),
    "mainRouterLocation" TEXT,
    "wifiCoverageRating" TEXT,
    "networkNotes" TEXT,
    "customerSpecialRequests" TEXT,
    "installationObstacles" TEXT,
    "technicianNotes" TEXT,
    "revisionReason" TEXT,
    "adminReviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_room_items" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL DEFAULT 'OTHER',
    "floorLevel" INTEGER NOT NULL DEFAULT 1,
    "lengthMeters" DECIMAL(5,2),
    "widthMeters" DECIMAL(5,2),
    "heightMeters" DECIMAL(4,2),
    "wallOutletsCount" INTEGER NOT NULL DEFAULT 2,
    "lightSwitchesCount" INTEGER NOT NULL DEFAULT 1,
    "existingAcUnits" INTEGER NOT NULL DEFAULT 0,
    "acUnitModel" TEXT,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "survey_room_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_photos" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "category" "SurveyPhotoCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_survey_history" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "previousStatus" "FieldSurveyStatus",
    "newStatus" "FieldSurveyStatus" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_survey_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_surveys_serviceOrderId_key" ON "field_surveys"("serviceOrderId");

-- CreateIndex
CREATE INDEX "field_surveys_status_idx" ON "field_surveys"("status");

-- CreateIndex
CREATE INDEX "field_surveys_technicianProfileId_idx" ON "field_surveys"("technicianProfileId");

-- CreateIndex
CREATE INDEX "survey_room_items_surveyId_idx" ON "survey_room_items"("surveyId");

-- CreateIndex
CREATE INDEX "survey_photos_surveyId_idx" ON "survey_photos"("surveyId");

-- CreateIndex
CREATE INDEX "survey_photos_category_idx" ON "survey_photos"("category");

-- CreateIndex
CREATE INDEX "field_survey_history_surveyId_createdAt_idx" ON "field_survey_history"("surveyId", "createdAt");

-- AddForeignKey
ALTER TABLE "field_surveys" ADD CONSTRAINT "field_surveys_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_surveys" ADD CONSTRAINT "field_surveys_technicianProfileId_fkey" FOREIGN KEY ("technicianProfileId") REFERENCES "technician_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_surveys" ADD CONSTRAINT "field_surveys_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_room_items" ADD CONSTRAINT "survey_room_items_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "field_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_photos" ADD CONSTRAINT "survey_photos_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "field_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_survey_history" ADD CONSTRAINT "field_survey_history_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "field_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_survey_history" ADD CONSTRAINT "field_survey_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
