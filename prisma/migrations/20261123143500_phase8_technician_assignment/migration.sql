-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "service_order_assignments" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "technicianProfileId" TEXT NOT NULL,
    "assignedByAdminId" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByAdminId" TEXT,
    "reassignmentReason" TEXT,
    "technicianInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Partial Unique Index enforcing exactly one ACTIVE primary technician per ServiceOrder
CREATE UNIQUE INDEX "unique_active_order_assignment" ON "service_order_assignments"("serviceOrderId") WHERE "status" = 'ACTIVE';

-- CreateIndex: Retrieval indexes
CREATE INDEX "service_order_assignments_serviceOrderId_status_idx" ON "service_order_assignments"("serviceOrderId", "status");
CREATE INDEX "service_order_assignments_technicianProfileId_status_idx" ON "service_order_assignments"("technicianProfileId", "status");
CREATE INDEX "service_order_assignments_assignedAt_idx" ON "service_order_assignments"("assignedAt");

-- AddForeignKey
ALTER TABLE "service_order_assignments" ADD CONSTRAINT "service_order_assignments_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_assignments" ADD CONSTRAINT "service_order_assignments_technicianProfileId_fkey" FOREIGN KEY ("technicianProfileId") REFERENCES "technician_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_assignments" ADD CONSTRAINT "service_order_assignments_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_assignments" ADD CONSTRAINT "service_order_assignments_revokedByAdminId_fkey" FOREIGN KEY ("revokedByAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "service_order_assignments" ADD CONSTRAINT "chk_assignment_active_revoked" CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL) OR 
    ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByAdminId" IS NOT NULL AND "reassignmentReason" IS NOT NULL)
);
