/**
 * PHASE 2 AUTOMATED TEST SUITE
 * Three-Role Identity Model, Unified Email/Username Login, Customer Registration & Account State
 */

import http from 'http';

process.env.NODE_ENV = 'test';

const { config: _envConfig } = await import('../config/env.js');
void _envConfig;
const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');
const { requireRole } = await import('../middlewares/auth.middleware.js');
const { seedUsers } = await import('./seed-users.js');

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

async function runPhase2Tests() {
  console.log('===================================================================');
  console.log('🔐 PHASE 2: THREE-ROLE IDENTITY, UNIFIED LOGIN & REGISTRATION TESTS');
  console.log('===================================================================\n');

  await seedUsers();

  const createdUserIds: string[] = [];
  const uniqueTag = Date.now().toString(36);
  const testEmailRaw = `  Phase2.Customer.${uniqueTag}@Example.COM  `;
  const testEmailNormalized = `phase2.customer.${uniqueTag}@example.com`;
  const testEmail2 = `phase2.isactive.${uniqueTag}@example.com`;
  const testTechUsername = `tech_p2_${uniqueTag}`;
  const testTechEmail = `tech.p2.${uniqueTag}@company.local`;

  const initialHouseCount = await prisma.house.count();
  const initialAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Ephemeral Phase 2 test server listening at ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------
    // A. DATABASE ENUM & EXISTING SUPER ADMIN AUTHENTICATION
    // ------------------------------------------------------------------
    console.log('--- A. Three-Role Enum & Existing Super Admin Authentication ---');
    {
      const enums: Array<{ enumlabel: string }> = await prisma.$queryRawUnsafe(`
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'UserRole'
        ORDER BY enumlabel ASC
      `);
      const enumLabels = enums.map((r) => r.enumlabel);
      assert(
        enumLabels.length === 3 &&
          enumLabels.includes('SUPER_ADMIN') &&
          enumLabels.includes('TECHNICIAN') &&
          enumLabels.includes('CUSTOMER'),
        `Database UserRole enum contains exactly 3 roles: [${enumLabels.join(', ')}]`
      );

      // Unified identifier login for existing Super Admin
      const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
      });
      const adminJson: any = await adminRes.json();
      assert(adminRes.status === 200 && adminJson.success === true, 'Existing Super Admin logs in with identifier="admin"');
      assert(adminJson.data?.user?.role === 'SUPER_ADMIN', 'Existing internal admin retains SUPER_ADMIN role (not converted to CUSTOMER)');
      assert(adminJson.data?.user?.id === initialAdmin?.id, 'Existing Super Admin ID preserved identically');
      assert(adminJson.data?.user?.lastLoginAt !== null, 'Super Admin lastLoginAt updated on successful login');
      assert(!('password' in (adminJson.data?.user || {})), 'Super Admin login response never exposes password hash');

      // Backward-compatible legacy payload { username, password }
      const legacyRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      assert(legacyRes.status === 200, 'Backward-compatible { username, password } login still works');

      // Token works with Phase 1 authenticated transport
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminJson.data.token}` },
      });
      const meJson: any = await meRes.json();
      assert(meRes.status === 200 && meJson.data?.role === 'SUPER_ADMIN', 'Super Admin JWT verified cleanly by /api/auth/me');
    }

    // ------------------------------------------------------------------
    // B. CUSTOMER SELF-REGISTRATION (POST /api/auth/register)
    // ------------------------------------------------------------------
    console.log('\n--- B. Customer Registration Security & Validation ---');
    let customerToken = '';
    let customerId = '';
    {
      // B1. Role escalation attempt: SUPER_ADMIN
      const escAdminRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Attacker Admin',
          email: `attacker.admin.${uniqueTag}@example.com`,
          password: 'Password123',
          role: 'SUPER_ADMIN',
        }),
      });
      assert(escAdminRes.status === 403, `Role escalation attempt (SUPER_ADMIN) rejected with HTTP 403 (got ${escAdminRes.status})`);

      // B2. Role escalation attempt: TECHNICIAN
      const escTechRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Attacker Tech',
          email: `attacker.tech.${uniqueTag}@example.com`,
          password: 'Password123',
          role: 'TECHNICIAN',
        }),
      });
      assert(escTechRes.status === 403, `Role escalation attempt (TECHNICIAN) rejected with HTTP 403 (got ${escTechRes.status})`);

      // B3. Invalid email rejected
      const badEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Bad Email User',
          email: 'not-an-email',
          password: 'Password123',
        }),
      });
      assert(badEmailRes.status === 400, `Invalid email format rejected with HTTP 400 (got ${badEmailRes.status})`);

      // B4. Weak passwords rejected
      for (const weakPass of ['short1', 'onlyletters', '12345678']) {
        const weakRes = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Weak Pass User',
            email: `weak.${uniqueTag}@example.com`,
            password: weakPass,
          }),
        });
        assert(weakRes.status === 400, `Weak password '${weakPass}' rejected with HTTP 400 (got ${weakRes.status})`);
      }

      // B5. Valid registration succeeds + normalizes email + ignores client isActive
      const regRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '  Siti Rahmawati  ',
          email: testEmailRaw,
          password: 'StrongPass2026',
          phone: '+62 812-0000-1111',
          isActive: false, // Must be ignored by server!
        }),
      });
      const regJson: any = await regRes.json();
      assert(regRes.status === 201 && regJson.success === true, `Valid Customer registration returns HTTP 201 (got ${regRes.status})`);
      assert(regJson.data?.user?.email === testEmailNormalized, 'Registered email is trimmed & normalized to lowercase');
      assert(regJson.data?.user?.name === 'Siti Rahmawati', 'Registered name is trimmed');
      assert(regJson.data?.user?.role === 'CUSTOMER', 'Server strictly assigns role = CUSTOMER');
      assert(regJson.data?.user?.isActive === true, 'Server ignores client isActive=false and enforces isActive=true');
      assert(regJson.data?.user?.username === null, 'Email-based Customer registration keeps username=null');
      assert(regJson.data?.user?.houseId === null, 'Registration does NOT create or attach a House/Property');
      assert(!('password' in (regJson.data?.user || {})), 'Registration response NEVER exposes password hash');

      customerToken = regJson.data.token;
      customerId = regJson.data.user.id;
      createdUserIds.push(customerId);

      // Verify zero side-effect houses created
      const houseCountAfterReg = await prisma.house.count();
      assert(houseCountAfterReg === initialHouseCount, 'Customer registration creates ZERO House records');

      // B6. Duplicate email rejected (case-insensitive)
      const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Duplicate User',
          email: testEmailNormalized.toUpperCase(),
          password: 'AnotherPass99',
        }),
      });
      assert(dupRes.status === 409, `Duplicate email (case-insensitive) rejected with HTTP 409 (got ${dupRes.status})`);

      // B7. Explicit client role: 'CUSTOMER' is safely accepted and produces CUSTOMER
      const reg2Res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Customer Two',
          email: testEmail2,
          password: 'StrongPass2026',
          role: 'CUSTOMER',
        }),
      });
      const reg2Json: any = await reg2Res.json();
      assert(reg2Res.status === 201 && reg2Json.data?.user?.role === 'CUSTOMER', 'Customer registration succeeds with explicit CUSTOMER role');
      if (reg2Json.data?.user?.id) createdUserIds.push(reg2Json.data.user.id);
    }

    // ------------------------------------------------------------------
    // C. CUSTOMER EMAIL LOGIN, ANTI-ENUMERATION & ACCOUNT DEACTIVATION
    // ------------------------------------------------------------------
    console.log('\n--- C. Customer Email Login, Anti-Enumeration & Active State ---');
    {
      // C1. Case-insensitive email login
      const custLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: testEmailNormalized.toUpperCase(),
          password: 'StrongPass2026',
        }),
      });
      const custLoginJson: any = await custLoginRes.json();
      assert(custLoginRes.status === 200 && custLoginJson.data?.user?.role === 'CUSTOMER', 'Customer logs in with case-insensitive email');
      customerToken = custLoginJson.data.token;

      // C2. Wrong password vs Non-existent email -> identical error message (anti-enumeration)
      const wrongPassRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testEmailNormalized, password: 'WrongPassword99' }),
      });
      const wrongPassJson: any = await wrongPassRes.json();

      const unknownEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nobody.exists@example.com', password: 'WrongPassword99' }),
      });
      const unknownEmailJson: any = await unknownEmailRes.json();

      assert(wrongPassRes.status === 401 && unknownEmailRes.status === 401, 'Both wrong password and unknown email return HTTP 401');
      assert(
        wrongPassJson.message === unknownEmailJson.message,
        'Wrong password and unknown email return identical anti-enumeration error message'
      );

      // C3. Deactivate customer account -> login rejected AND previously issued JWT immediately rejected!
      await prisma.user.update({
        where: { id: customerId },
        data: { isActive: false },
      });

      const inactiveLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testEmailNormalized, password: 'StrongPass2026' }),
      });
      const inactiveLoginJson: any = await inactiveLoginRes.json();
      assert(inactiveLoginRes.status === 401, 'Inactive Customer login rejected with HTTP 401');
      assert(
        inactiveLoginJson.message === wrongPassJson.message,
        'Inactive account login uses same anti-enumeration message'
      );

      // Previously valid JWT is rejected immediately by authenticateToken middleware
      const staleJwtMeRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert(staleJwtMeRes.status === 401, 'Previously valid JWT of deactivated user rejected with HTTP 401 on /api/auth/me');

      const staleJwtHousesRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      assert(staleJwtHousesRes.status === 401, 'Previously valid JWT of deactivated user rejected with HTTP 401 on private routes');
    }

    // ------------------------------------------------------------------
    // D. TECHNICIAN ROLE LOGIN & 3-ROLE MIDDLEWARE GUARD
    // ------------------------------------------------------------------
    console.log('\n--- D. Technician Role Identity & 3-Role Middleware Guard ---');
    {
      const techUser = await prisma.user.create({
        data: {
          name: 'Teknisi Lapangan Test',
          username: testTechUsername,
          email: testTechEmail,
          password: hashPassword('TechPass2026'),
          role: 'TECHNICIAN',
          isActive: true,
        },
      });
      createdUserIds.push(techUser.id);

      // Login via username
      const techByUserRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testTechUsername, password: 'TechPass2026' }),
      });
      const techByUserJson: any = await techByUserRes.json();
      assert(techByUserRes.status === 200 && techByUserJson.data?.user?.role === 'TECHNICIAN', 'Technician logs in with username');

      // Login via email
      const techByEmailRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testTechEmail.toUpperCase(), password: 'TechPass2026' }),
      });
      assert(techByEmailRes.status === 200, 'Technician logs in with case-insensitive email');

      // Middleware requireRole checks across all 3 roles
      let techBlockedOnSuperAdmin = 0;
      requireRole('SUPER_ADMIN')(
        { user: { userId: techUser.id, role: 'TECHNICIAN' } } as any,
        { status: (c: number) => ({ json: () => { techBlockedOnSuperAdmin = c; } }) } as any,
        () => {}
      );
      assert(techBlockedOnSuperAdmin === 403, 'requireRole(SUPER_ADMIN) blocks TECHNICIAN with HTTP 403');

      let techAllowedOnTech = false;
      requireRole('SUPER_ADMIN', 'TECHNICIAN')(
        { user: { userId: techUser.id, role: 'TECHNICIAN' } } as any,
        {} as any,
        () => { techAllowedOnTech = true; }
      );
      assert(techAllowedOnTech, 'requireRole(SUPER_ADMIN, TECHNICIAN) allows TECHNICIAN');

      let custBlockedOnTech = 0;
      requireRole('SUPER_ADMIN', 'TECHNICIAN')(
        { user: { userId: customerId, role: 'CUSTOMER' } } as any,
        { status: (c: number) => ({ json: () => { custBlockedOnTech = c; } }) } as any,
        () => {}
      );
      assert(custBlockedOnTech === 403, 'requireRole(SUPER_ADMIN, TECHNICIAN) blocks CUSTOMER with HTTP 403');
    }
  } finally {
    // Cleanup ONLY test users created in this run
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 2 IDENTITY & AUTH TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('❌ Unhandled Phase 2 test error:', err);
  process.exit(1);
});
