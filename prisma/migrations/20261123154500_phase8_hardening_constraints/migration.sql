-- Phase 8 Final Hardening: Strengthen ServiceOrderAssignment Constraints & onDelete Restrict

-- 1. Ensure foreign key constraint on revokedByAdminId uses ON DELETE RESTRICT
ALTER TABLE "service_order_assignments"
DROP CONSTRAINT IF EXISTS "service_order_assignments_revokedByAdminId_fkey";

ALTER TABLE "service_order_assignments"
ADD CONSTRAINT "service_order_assignments_revokedByAdminId_fkey"
FOREIGN KEY ("revokedByAdminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Drop existing lifecycle check constraint if present
ALTER TABLE "service_order_assignments"
DROP CONSTRAINT IF EXISTS "chk_assignment_active_revoked";

ALTER TABLE "service_order_assignments"
DROP CONSTRAINT IF EXISTS "chk_assignment_lifecycle_integrity";

-- 3. Add strengthened lifecycle integrity check constraint:
-- - ACTIVE assignments must have revokedAt IS NULL
-- - REVOKED assignments must have revokedAt IS NOT NULL, revokedByAdminId IS NOT NULL,
--   and a non-null reassignmentReason containing at least 5 non-whitespace characters.
ALTER TABLE "service_order_assignments"
ADD CONSTRAINT "chk_assignment_lifecycle_integrity"
CHECK (
    ("status" = 'ACTIVE' AND "revokedAt" IS NULL) OR 
    ("status" = 'REVOKED' AND 
     "revokedAt" IS NOT NULL AND 
     "revokedByAdminId" IS NOT NULL AND 
     "reassignmentReason" IS NOT NULL AND 
     LENGTH(REGEXP_REPLACE("reassignmentReason", '\s+', '', 'g')) >= 5)
);
