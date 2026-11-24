/**
 * SEED USERS SCRIPT (PHASE 3 — PROFILES & MULTI-PROPERTY OWNERSHIP)
 *
 * Non-destructive bootstrap seeder:
 * - Preserves existing Super Admin account & password hash (never creates CustomerProfile/TechnicianProfile)
 * - Preserves existing legacy Customer account & ensures its 1:1 CustomerProfile exists
 * - Never overwrites existing passwords on restart
 */

import { prisma } from '../services/db.service.js';
import { hashPassword } from '../utils/auth-crypto.util.js';

export async function seedUsers() {
  console.log('====================================================');
  console.log('🌱 VERIFYING DEFAULT ACCOUNTS & PROFILES');
  console.log('====================================================');

  // 1. Preserve or create default SUPER_ADMIN (never overwrite existing passwords)
  let admin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!admin) {
    const anyAdmin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
    if (anyAdmin) {
      admin = anyAdmin;
      console.log(`  ℹ️ [SUPER_ADMIN] Existing super admin preserved: '${admin.username || admin.email}' (ID: ${admin.id})`);
    } else {
      const adminPasswordHash = hashPassword('admin123');
      admin = await prisma.user.create({
        data: {
          username: 'admin',
          name: 'Administrator Smart Home',
          role: 'SUPER_ADMIN',
          isActive: true,
          password: adminPasswordHash,
        },
      });
      console.log(`  ✅ [SUPER_ADMIN] Created default account 'admin' (ID: ${admin.id})`);
    }
  } else {
    console.log(`  ✅ [SUPER_ADMIN] Account 'admin' preserved (ID: ${admin.id})`);
  }

  // 2. Preserve existing legacy 'penghuni' CUSTOMER account & ensure 1:1 CustomerProfile exists
  let resident = await prisma.user.findUnique({
    where: { username: 'penghuni' },
    include: { customerProfile: true },
  });

  if (!resident) {
    const residentPasswordHash = hashPassword('penghuni123');
    resident = await prisma.user.create({
      data: {
        username: 'penghuni',
        name: 'Penghuni Rumah',
        role: 'CUSTOMER',
        isActive: true,
        password: residentPasswordHash,
        customerProfile: {
          create: {
            fullName: 'Penghuni Rumah',
          },
        },
      },
      include: { customerProfile: true },
    });
    console.log(`  ✅ [CUSTOMER] Created default dev account 'penghuni' with CustomerProfile (ID: ${resident.id})`);
  } else {
    if (!resident.customerProfile) {
      await prisma.customerProfile.create({
        data: {
          userId: resident.id,
          fullName: resident.name,
          phone: resident.phone ?? null,
        },
      });
      console.log(`  ✅ [CUSTOMER] Backfilled CustomerProfile for legacy account 'penghuni' (ID: ${resident.id})`);
    } else {
      console.log(`  ✅ [CUSTOMER] Legacy account 'penghuni' & CustomerProfile preserved (ID: ${resident.id})`);
    }
  }

  // 3. Preserve or create default dev TECHNICIAN account & ensure 1:1 TechnicianProfile exists
  let technician = await prisma.user.findUnique({
    where: { username: 'teknisi' },
    include: { technicianProfile: true },
  });

  if (!technician) {
    const techPasswordHash = hashPassword('teknisi123');
    technician = await prisma.user.create({
      data: {
        username: 'teknisi',
        email: 'teknisi@smarthome.id',
        name: 'Teknisi Lapangan',
        role: 'TECHNICIAN',
        isActive: true,
        password: techPasswordHash,
        technicianProfile: {
          create: {
            employeeCode: 'TECH-001',
            specialization: 'IoT & Smart Device Installation',
            serviceArea: 'Jabodetabek',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    console.log(`  ✅ [TECHNICIAN] Created default dev account 'teknisi' with TechnicianProfile (ID: ${technician.id})`);
  } else {
    if (!technician.technicianProfile) {
      await prisma.technicianProfile.create({
        data: {
          userId: technician.id,
          employeeCode: 'TECH-001',
          specialization: 'IoT & Smart Device Installation',
          serviceArea: 'Jabodetabek',
          availabilityStatus: 'AVAILABLE',
        },
      });
      console.log(`  ✅ [TECHNICIAN] Backfilled TechnicianProfile for account 'teknisi' (ID: ${technician.id})`);
    } else {
      console.log(`  ✅ [TECHNICIAN] Dev account 'teknisi' & TechnicianProfile preserved (ID: ${technician.id})`);
    }
  }

  console.log('====================================================');
  console.log('✨ DEFAULT ACCOUNT & PROFILE VERIFICATION COMPLETED');
  console.log('====================================================\n');

  return { admin, resident, technician };
}

// Self-executing if run directly via CLI
if (process.argv[1]?.includes('seed-users')) {
  seedUsers()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error('Error seeding users:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
