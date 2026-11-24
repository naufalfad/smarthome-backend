-- AlterEnum
ALTER TYPE "AssignmentStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "service_order_assignments" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Update Lifecycle Check Constraint for COMPLETED status
ALTER TABLE "service_order_assignments"
DROP CONSTRAINT IF EXISTS "chk_assignment_lifecycle_integrity";

ALTER TABLE "service_order_assignments"
ADD CONSTRAINT "chk_assignment_lifecycle_integrity"
CHECK (
    ("status"::text = 'ACTIVE' AND "revokedAt" IS NULL) OR 
    ("status"::text = 'COMPLETED' AND "revokedAt" IS NULL AND "completedAt" IS NOT NULL) OR
    ("status"::text = 'REVOKED' AND 
     "revokedAt" IS NOT NULL AND 
     "revokedByAdminId" IS NOT NULL AND 
     "reassignmentReason" IS NOT NULL AND 
     LENGTH(REGEXP_REPLACE("reassignmentReason", '\s+', '', 'g')) >= 5)
);
