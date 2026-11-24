/**
 * PHASE 3 AUTOMATED TEST SUITE
 * CustomerProfile, TechnicianProfile, Multi-Property Ownership (1:N),
 * Safe Legacy Ownership Migration & Removal of Auto-Demo Property Creation
 */

import http from 'http';

process.env.NODE_ENV = 'test';

const { config: _envConfig } = await import('../config/env.js');
void _envConfig;
const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');
const { AuthService } = await import('../services/auth.service.js');
const { HouseService } = await import('../services/house.service.js');
const { runPhase3BackfillAndOwnershipMigration } = await import('./migrate-phase3-ownership.js');

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

async function runPhase3Tests() {
  console.log('===================================================================');
  console.log('🏠 PHASE 3: PROFILES & MULTI-PROPERTY OWNERSHIP (1:N) TEST SUITE');
  console.log('===================================================================\n');

  const uniqueTag = Date.now().toString(36);
  const createdUserIds: string[] = [];
  const createdHouseIds: string[] = [];

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // ------------------------------------------------------------------
    // 1. CUSTOMER PROFILE TESTS
    // ------------------------------------------------------------------
    console.log('--- 1. CustomerProfile 1:1 Relationship & Backfill ---');
    let custProfileId = '';
    let custEmail = `p3.customer.${uniqueTag}@example.com`;
    {
      // Register new Customer -> must atomically create 1:1 CustomerProfile
      const reg = await AuthService.registerCustomer({
        name: 'Andi Wijaya',
        email: custEmail,
        password: 'Password2026',
        phone: '+62 811-2233-4455',
      });
      createdUserIds.push(reg.user.id);

      assert(reg.user.customerProfile !== null, 'Newly registered Customer automatically gets a CustomerProfile');
      assert(reg.user.customerProfile?.userId === reg.user.id, 'CustomerProfile.userId references the exact User');
      assert(reg.user.customerProfile?.fullName === 'Andi Wijaya', 'CustomerProfile.fullName reuses User.name');
      assert(reg.user.customerProfile?.phone === '+62 811-2233-4455', 'CustomerProfile.phone reuses User.phone');
      assert(reg.user.customerProfile?.billingAddress === null, 'CustomerProfile does not invent billingAddress');
      assert(reg.user.customerProfile?.companyName === null, 'CustomerProfile does not invent companyName');
      assert(reg.user.technicianProfile === null, 'Customer does NOT receive a TechnicianProfile');
      assert(reg.user.ownedHouseIds.length === 0 && reg.user.houseId === null, 'New Customer starts validly with 0 properties');

      custProfileId = reg.user.customerProfile!.id;

      // Duplicate CustomerProfile for same userId must fail with P2002
      let dupProfileRejected = false;
      try {
        await prisma.customerProfile.create({
          data: { userId: reg.user.id, fullName: 'Duplicate' },
        });
      } catch (err: any) {
        dupProfileRejected = err?.code === 'P2002';
      }
      assert(dupProfileRejected, 'Duplicate CustomerProfile for the same User is rejected by unique constraint');

      // Existing legacy Customer ('penghuni') has backfilled CustomerProfile
      const legacyCustomer = await prisma.user.findUnique({
        where: { username: 'penghuni' },
        include: { customerProfile: true, technicianProfile: true },
      });
      assert(legacyCustomer?.customerProfile !== null, 'Existing legacy Customer (penghuni) has backfilled CustomerProfile');
      assert(legacyCustomer?.technicianProfile === null, 'Existing legacy Customer has NO TechnicianProfile');

      // Super Admin ('admin') has neither CustomerProfile nor TechnicianProfile
      const superAdmin = await prisma.user.findUnique({
        where: { username: 'admin' },
        include: { customerProfile: true, technicianProfile: true },
      });
      assert(superAdmin?.customerProfile === null, 'Super Admin does NOT receive a CustomerProfile');
      assert(superAdmin?.technicianProfile === null, 'Super Admin does NOT receive a TechnicianProfile');
    }

    // ------------------------------------------------------------------
    // 2. TECHNICIAN PROFILE TESTS
    // ------------------------------------------------------------------
    console.log('\n--- 2. TechnicianProfile 1:1 Relationship & Backfill ---');
    {
      // Create temporary Technician users without profiles to test backfill & uniqueness
      const tech1 = await prisma.user.create({
        data: {
          name: 'Teknisi Satu',
          username: `tech1_${uniqueTag}`,
          email: `tech1.${uniqueTag}@company.local`,
          password: hashPassword('TechPass2026'),
          role: 'TECHNICIAN',
          isActive: true,
        },
      });
      createdUserIds.push(tech1.id);

      const tech2 = await prisma.user.create({
        data: {
          name: 'Teknisi Dua',
          username: `tech2_${uniqueTag}`,
          email: `tech2.${uniqueTag}@company.local`,
          password: hashPassword('TechPass2026'),
          role: 'TECHNICIAN',
          isActive: true,
        },
      });
      createdUserIds.push(tech2.id);

      const backfill1 = await runPhase3BackfillAndOwnershipMigration();
      assert(backfill1.actions.technicianProfilesCreated === 2, `Backfill created TechnicianProfile for 2 Technician users (got ${backfill1.actions.technicianProfilesCreated})`);

      const tech1Profile = await prisma.technicianProfile.findUnique({ where: { userId: tech1.id } });
      const tech2Profile = await prisma.technicianProfile.findUnique({ where: { userId: tech2.id } });
      assert(tech1Profile !== null && tech2Profile !== null, 'Both Technician users received TechnicianProfiles with null employeeCode allowed');
      assert(tech1Profile?.availabilityStatus === 'AVAILABLE', 'TechnicianProfile defaults to safe availabilityStatus = AVAILABLE');
      assert(tech1Profile?.employeeCode === null && tech1Profile?.specialization === null, 'Backfill does not invent employeeCode or specialization');

      // Re-run backfill -> idempotent (0 created)
      const backfill2 = await runPhase3BackfillAndOwnershipMigration();
      assert(
        backfill2.actions.technicianProfilesCreated === 0 && backfill2.actions.customerProfilesCreated === 0,
        'Backfill script is 100% idempotent on repeat runs'
      );

      // Duplicate TechnicianProfile for same userId rejected
      let dupTechRejected = false;
      try {
        await prisma.technicianProfile.create({ data: { userId: tech1.id } });
      } catch (err: any) {
        dupTechRejected = err?.code === 'P2002';
      }
      assert(dupTechRejected, 'Duplicate TechnicianProfile for same User is rejected');

      // Unique employeeCode enforced when populated
      const empCode = `EMP-${uniqueTag}`;
      await prisma.technicianProfile.update({
        where: { id: tech1Profile!.id },
        data: { employeeCode: empCode },
      });
      let dupEmpRejected = false;
      try {
        await prisma.technicianProfile.update({
          where: { id: tech2Profile!.id },
          data: { employeeCode: empCode },
        });
      } catch (err: any) {
        dupEmpRejected = err?.code === 'P2002';
      }
      assert(dupEmpRejected, 'Duplicate populated employeeCode is rejected by unique constraint');

      // Super Admin & Customer never receive TechnicianProfile
      const adminTechProfile = await prisma.technicianProfile.findFirst({
        where: { user: { role: { in: ['SUPER_ADMIN', 'CUSTOMER'] } } },
      });
      assert(adminTechProfile === null, 'SUPER_ADMIN and CUSTOMER users never receive TechnicianProfile');
    }

    // ------------------------------------------------------------------
    // 3. MULTI-PROPERTY OWNERSHIP (1:N) & PROPERTY ATTRIBUTES
    // ------------------------------------------------------------------
    console.log('\n--- 3. Multi-Property Ownership (CustomerProfile 1:N House) ---');
    {
      // Property 1: With physical IoT & address
      const house1 = await HouseService.createHouse({
        name: `Villa Utama ${uniqueTag}`,
        address: 'Jl. Kemang Raya No. 10, Jakarta Selatan',
        propertyType: 'VILLA',
        hasPhysicalIot: true,
        customerId: custProfileId,
      });
      createdHouseIds.push(house1.id);

      // Property 2: Without physical IoT & nullable address during setup
      const house2 = await HouseService.createHouse({
        name: `Apartemen Digital ${uniqueTag}`,
        address: null,
        propertyType: 'APARTMENT',
        hasPhysicalIot: false,
        customerId: custProfileId,
      });
      createdHouseIds.push(house2.id);

      assert(house1.customerId === custProfileId && house2.customerId === custProfileId, 'One CustomerProfile can own multiple Houses (1:N)');
      assert(house1.setupStatus === 'DRAFT' && house2.setupStatus === 'DRAFT', 'New properties default safely to setupStatus = DRAFT');
      assert(house2.hasPhysicalIot === false, 'Property without physical IoT (hasPhysicalIot=false) is valid');
      assert(house2.address === null, 'Property with nullable address during setup is valid');

      const ownedList = await HouseService.listHousesByCustomerProfile(custProfileId);
      assert(ownedList.length === 2, `listHousesByCustomerProfile returns all 2 owned properties (got ${ownedList.length})`);

      // AuthService.login for multi-property customer MUST NOT silently select house[0]
      const loginMulti = await AuthService.login(custEmail, 'Password2026');
      assert(loginMulti.user.ownedHouseIds.length === 2, 'Login returns both ownedHouseIds for multi-property Customer');
      assert(loginMulti.user.houseId === null, 'Multi-property Customer does NOT silently pick first property in houseId');

      // Invalid customerId rejected
      let invalidOwnerRejected = false;
      try {
        await HouseService.createHouse({
          name: 'Invalid Owner House',
          customerId: '00000000-0000-4000-8000-000000000000',
        });
      } catch {
        invalidOwnerRejected = true;
      }
      assert(invalidOwnerRejected, 'Creating House with non-existent CustomerProfile ID is rejected');
    }

    // ------------------------------------------------------------------
    // 4. LEGACY OWNERSHIP MIGRATION & CONFLICT PROTECTION
    // ------------------------------------------------------------------
    console.log('\n--- 4. Legacy Ownership Migration & Conflict Guard ---');
    {
      // Verify Villa Sentosa migrated to penghuni's CustomerProfile
      const legacyUser = await prisma.user.findUnique({
        where: { username: 'penghuni' },
        include: { customerProfile: true },
      });
      const villaSentosa = await prisma.house.findUnique({
        where: { id: 'cdec4952-bdf2-4eae-bd89-74e8b007398a' },
      });
      assert(
        villaSentosa?.customerId === legacyUser?.customerProfile?.id,
        'Legacy Villa Sentosa ownership migrated accurately from User.houseId -> House.customerId'
      );
      assert(villaSentosa?.setupStatus === 'DRAFT', 'Existing Villa Sentosa was NOT auto-marked ACTIVE');

      // Verify PUBLISHED legacy house with no user stays unresolved & DRAFT setupStatus
      const publishedUnowned = await prisma.house.findUnique({
        where: { id: 'e8584d1a-ba5e-493b-8398-f704cf9781a5' },
      });
      assert(
        publishedUnowned?.publishStatus === 'PUBLISHED' &&
          publishedUnowned?.setupStatus === 'DRAFT' &&
          publishedUnowned?.customerId === null,
        'Existing PUBLISHED unowned house keeps publishStatus=PUBLISHED, setupStatus=DRAFT, customerId=null (never guessed/auto-activated)'
      );

      // Simulate conflicting legacy User.houseId (2 Customers claiming same House) -> must skip without guessing!
      const conflictHouse = await HouseService.createHouse({ name: `Conflict House ${uniqueTag}` });
      createdHouseIds.push(conflictHouse.id);

      const c1 = await prisma.user.create({
        data: {
          name: 'Conflict C1',
          email: `c1.${uniqueTag}@example.com`,
          password: hashPassword('Password2026'),
          role: 'CUSTOMER',
          houseId: conflictHouse.id,
        },
      });
      const c2 = await prisma.user.create({
        data: {
          name: 'Conflict C2',
          email: `c2.${uniqueTag}@example.com`,
          password: hashPassword('Password2026'),
          role: 'CUSTOMER',
          houseId: conflictHouse.id,
        },
      });
      createdUserIds.push(c1.id, c2.id);

      const conflictReport = await runPhase3BackfillAndOwnershipMigration();
      const conflictHouseAfter = await prisma.house.findUnique({ where: { id: conflictHouse.id } });
      assert(
        conflictReport.actions.ownershipConflictsSkipped.some((c) => c.houseId === conflictHouse.id),
        'Conflicting legacy ownership is explicitly detected and reported'
      );
      assert(
        conflictHouseAfter?.customerId === null,
        'Conflicting House remains customerId=null (never guesses owner)'
      );
    }

    // ------------------------------------------------------------------
    // 5. DEMO PROPERTY REMOVAL & READ-ONLY LISTING
    // ------------------------------------------------------------------
    console.log('\n--- 5. Demo Property Removal & Read-Only HouseService.listHouses() ---');
    {
      // Empty customer list returns [] without creating any House
      const emptyCust = await AuthService.registerCustomer({
        name: 'Zero Property Customer',
        email: `zero.prop.${uniqueTag}@example.com`,
        password: 'Password2026',
      });
      createdUserIds.push(emptyCust.user.id);

      const countBefore = await prisma.house.count();
      const emptyList = await HouseService.listHouses({ customerId: emptyCust.user.customerProfile!.id });
      const countAfter = await prisma.house.count();

      assert(Array.isArray(emptyList) && emptyList.length === 0, 'Empty property query legitimately returns []');
      assert(countBefore === countAfter, 'HouseService.listHouses() does NOT mutate DB or create demo House');

      // Existing 'Modern Smart Villa' record is preserved (never deleted)
      const demoNamed = await HouseService.createHouse({ name: 'Modern Smart Villa' });
      createdHouseIds.push(demoNamed.id);
      const allHouses = await HouseService.listHouses();
      assert(
        allHouses.some((h) => h.id === demoNamed.id && h.name === 'Modern Smart Villa'),
        'Existing house named Modern Smart Villa is safely preserved by listHouses()'
      );
    }

    // ------------------------------------------------------------------
    // 6. SUPER ADMIN HTTP WORKFLOW COMPATIBILITY
    // ------------------------------------------------------------------
    console.log('\n--- 6. Super Admin HTTP Workflow Compatibility ---');
    {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
      });
      const loginJson: any = await loginRes.json();
      assert(loginRes.status === 200 && loginJson.data?.user?.role === 'SUPER_ADMIN', 'Super Admin HTTP login succeeds');

      const housesRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${loginJson.data.token}` },
      });
      const housesJson: any = await housesRes.json();
      assert(housesRes.status === 200 && Array.isArray(housesJson.data), 'Super Admin GET /api/houses succeeds');
      const villa = housesJson.data.find((h: any) => h.id === 'cdec4952-bdf2-4eae-bd89-74e8b007398a');
      assert(villa?.customer?.fullName === 'Penghuni Rumah', 'GET /api/houses includes owning CustomerProfile metadata');
    }
  } finally {
    // Cleanup ONLY temporary test records created in this run
    if (createdHouseIds.length > 0) {
      await prisma.house.deleteMany({ where: { id: { in: createdHouseIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 3 PROFILE & OWNERSHIP TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase3Tests().catch((err) => {
  console.error('❌ Unhandled Phase 3 test error:', err);
  process.exit(1);
});
