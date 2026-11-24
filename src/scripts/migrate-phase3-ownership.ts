/**
 * PHASE 3 IDEMPOTENT BACKFILL & LEGACY OWNERSHIP MIGRATION SCRIPT
 *
 * Responsibilities:
 * 1. Safely backfills CustomerProfile for all existing CUSTOMER users lacking a profile
 *    (reuses User.name & User.phone; never invents billingAddress/companyName).
 * 2. Safely backfills TechnicianProfile for all existing TECHNICIAN users lacking a profile
 *    (never creates for SUPER_ADMIN or CUSTOMER; never invents employeeCode/specialization).
 * 3. Migrates confident legacy User.houseId relationships -> House.customerId.
 * 4. Detects & refuses conflicting or broken ownership without guessing or overwriting.
 * 5. Reports exact before/after counts and lists unresolved Houses (customerId = null).
 */

import '../config/env.js';
import { prisma, disconnectDatabase } from '../services/db.service.js';

export interface Phase3MigrationReport {
  before: {
    customerUsers: number;
    technicianUsers: number;
    customerProfiles: number;
    technicianProfiles: number;
    housesTotal: number;
    housesWithCustomerId: number;
    legacyUserHouseLinks: number;
  };
  actions: {
    customerProfilesCreated: number;
    technicianProfilesCreated: number;
    ownershipLinksMigrated: number;
    ownershipConflictsSkipped: Array<{ houseId: string; houseName: string; reason: string }>;
    brokenLegacyLinksSkipped: Array<{ userId: string; houseId: string }>;
  };
  after: {
    customerProfiles: number;
    technicianProfiles: number;
    housesTotal: number;
    housesWithCustomerId: number;
    unresolvedHouses: Array<{ id: string; name: string; publishStatus: string }>;
  };
}

export async function runPhase3BackfillAndOwnershipMigration(): Promise<Phase3MigrationReport> {
  const before = {
    customerUsers: await prisma.user.count({ where: { role: 'CUSTOMER' } }),
    technicianUsers: await prisma.user.count({ where: { role: 'TECHNICIAN' } }),
    customerProfiles: await prisma.customerProfile.count(),
    technicianProfiles: await prisma.technicianProfile.count(),
    housesTotal: await prisma.house.count(),
    housesWithCustomerId: await prisma.house.count({ where: { customerId: { not: null } } }),
    legacyUserHouseLinks: await prisma.user.count({
      where: { role: 'CUSTOMER', houseId: { not: null } },
    }),
  };

  let customerProfilesCreated = 0;
  let technicianProfilesCreated = 0;
  let ownershipLinksMigrated = 0;
  const ownershipConflictsSkipped: Array<{ houseId: string; houseName: string; reason: string }> = [];
  const brokenLegacyLinksSkipped: Array<{ userId: string; houseId: string }> = [];

  // 1. Idempotent backfill for CUSTOMER users
  const customerUsers = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    include: { customerProfile: true },
    orderBy: { createdAt: 'asc' },
  });

  const userIdToProfileId = new Map<string, string>();
  for (const user of customerUsers) {
    if (user.customerProfile) {
      userIdToProfileId.set(user.id, user.customerProfile.id);
    } else {
      const created = await prisma.customerProfile.create({
        data: {
          userId: user.id,
          fullName: user.name,
          phone: user.phone ?? null,
        },
      });
      userIdToProfileId.set(user.id, created.id);
      customerProfilesCreated++;
    }
  }

  // 2. Idempotent backfill for TECHNICIAN users (NEVER for SUPER_ADMIN or CUSTOMER)
  const techUsers = await prisma.user.findMany({
    where: { role: 'TECHNICIAN' },
    include: { technicianProfile: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const tech of techUsers) {
    if (!tech.technicianProfile) {
      await prisma.technicianProfile.create({
        data: {
          userId: tech.id,
          availabilityStatus: 'AVAILABLE',
        },
      });
      technicianProfilesCreated++;
    }
  }

  // 3. Migrate confident legacy User.houseId -> House.customerId
  // Detect any House referenced by >1 Customer user first so we never guess
  const claimsByHouseId = new Map<string, Array<{ userId: string; profileId: string }>>();
  for (const user of customerUsers) {
    if (!user.houseId) continue;
    const profileId = userIdToProfileId.get(user.id);
    if (!profileId) continue;

    const list = claimsByHouseId.get(user.houseId) || [];
    list.push({ userId: user.id, profileId });
    claimsByHouseId.set(user.houseId, list);
  }

  for (const [houseId, claims] of claimsByHouseId.entries()) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      select: { id: true, name: true, customerId: true },
    });

    if (!house) {
      for (const c of claims) {
        brokenLegacyLinksSkipped.push({ userId: c.userId, houseId });
      }
      continue;
    }

    if (claims.length > 1) {
      ownershipConflictsSkipped.push({
        houseId: house.id,
        houseName: house.name,
        reason: `Multiple CUSTOMER users (${claims.length}) reference this House via legacy User.houseId; manual resolution required.`,
      });
      continue;
    }

    const targetProfileId = claims[0].profileId;
    if (house.customerId && house.customerId !== targetProfileId) {
      ownershipConflictsSkipped.push({
        houseId: house.id,
        houseName: house.name,
        reason: `House already owned by different CustomerProfile '${house.customerId}'; refusing overwrite.`,
      });
      continue;
    }

    if (!house.customerId) {
      await prisma.house.update({
        where: { id: house.id },
        data: { customerId: targetProfileId },
      });
      ownershipLinksMigrated++;
    }
  }

  const unresolvedHouses = await prisma.house.findMany({
    where: { customerId: null },
    select: { id: true, name: true, publishStatus: true },
    orderBy: { createdAt: 'asc' },
  });

  const after = {
    customerProfiles: await prisma.customerProfile.count(),
    technicianProfiles: await prisma.technicianProfile.count(),
    housesTotal: await prisma.house.count(),
    housesWithCustomerId: await prisma.house.count({ where: { customerId: { not: null } } }),
    unresolvedHouses,
  };

  return {
    before,
    actions: {
      customerProfilesCreated,
      technicianProfilesCreated,
      ownershipLinksMigrated,
      ownershipConflictsSkipped,
      brokenLegacyLinksSkipped,
    },
    after,
  };
}

if (process.argv[1]?.includes('migrate-phase3-ownership')) {
  runPhase3BackfillAndOwnershipMigration()
    .then(async (report) => {
      console.log('====================================================');
      console.log('📦 PHASE 3 BACKFILL & OWNERSHIP MIGRATION REPORT');
      console.log('====================================================');
      console.log(JSON.stringify(report, null, 2));
      await disconnectDatabase();
    })
    .catch(async (err) => {
      console.error('❌ Phase 3 backfill failed:', err);
      await disconnectDatabase();
      process.exit(1);
    });
}
