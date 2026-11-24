import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const all = await prisma.serviceOrderAssignment.findMany();
  console.log(`Total assignments in DB: ${all.length}`);
  console.log('Existing records:', JSON.stringify(all, null, 2));

  // Query PostgreSQL constraints on table service_order_assignments
  const constraints = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'service_order_assignments';
  `;
  console.log('Existing constraints:', JSON.stringify(constraints, null, 2));
  
  const violations: Array<{ id: string; status: string; issue: string }> = [];

  for (const a of all) {
    if (a.status === 'ACTIVE') {
      if (a.revokedAt !== null) {
        violations.push({ id: a.id, status: a.status, issue: 'ACTIVE assignment has non-null revokedAt' });
      }
    } else if (a.status === 'REVOKED') {
      if (a.revokedAt === null) {
        violations.push({ id: a.id, status: a.status, issue: 'REVOKED assignment has null revokedAt' });
      }
      if (a.revokedByAdminId === null) {
        violations.push({ id: a.id, status: a.status, issue: 'REVOKED assignment has null revokedByAdminId' });
      }
      const trimmed = (a.reassignmentReason || '').replace(/\s+/g, '');
      if (!a.reassignmentReason || trimmed.length < 5) {
        violations.push({
          id: a.id,
          status: a.status,
          issue: `REVOKED assignment has invalid reassignmentReason: '${a.reassignmentReason}'`,
        });
      }
    }
  }

  console.log('Violations count:', violations.length);
  if (violations.length > 0) {
    console.log('Violations detail:', JSON.stringify(violations, null, 2));
  } else {
    console.log('All existing database records strictly conform to the required constraints!');
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
