/**
 * PHASE 1 AUTOMATED TEST SUITE
 * Platform Security Baseline, Singleton DB Pool & Authenticated Transport
 *
 * Verifies:
 * 1. Public endpoints remain accessible without token (/, /api/health, /api/health/live, /api/auth/login, /api/auth/logout)
 * 2. Login error status codes (401 on invalid credentials, no password/secret leakage)
 * 3. Deny-by-default authentication across all private & internal endpoints (401 without token)
 * 4. Token rejection for invalid, alg=none, expired, and non-existent user tokens (401)
 * 5. Valid Bearer token succeeds across 2D Floor Plan, Rooms, IoT Catalog, Devices, Simulation,
 *    Providers, Automation, Dashboard, Health Diagnostics, and Legacy 3D Studio endpoints
 * 6. Prisma Singleton verification (single runtime instance & DB connectivity)
 * 7. Non-destructive seedUsers() password preservation
 * 8. Production error sanitization (no stack trace / secret leakage)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Ensure test mode BEFORE loading env/server so server.ts does not bind port 5000
process.env.NODE_ENV = 'test';

const { config: _envConfig } = await import('../config/env.js');
void _envConfig;
const { app } = await import('../server.js');
const { prisma, disconnectDatabase, checkDatabaseConnection } = await import('../services/db.service.js');
const { generateToken, verifyToken } = await import('../utils/auth-crypto.util.js');
const { seedUsers } = await import('./seed-users.js');
const { errorHandler } = await import('../middlewares/error.middleware.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runPhase1Tests() {
  console.log('===================================================================');
  console.log('🛡️  PHASE 1: SECURITY BASELINE, PRISMA SINGLETON & AUTH TRANSPORT');
  console.log('===================================================================\n');

  await seedUsers();

  // Spin up Express app on ephemeral local port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Ephemeral Phase 1 test server listening at ${baseUrl}\n`);

  try {
    // ------------------------------------------------------------------
    // 1. PUBLIC ENDPOINTS WITHOUT TOKEN
    // ------------------------------------------------------------------
    console.log('--- 1. Public Endpoints Accessibility ---');
    {
      const rootRes = await fetch(`${baseUrl}/`);
      assert(rootRes.status === 200, 'GET / returns 200 without token');

      const healthRes = await fetch(`${baseUrl}/api/health`);
      const healthJson: any = await healthRes.json();
      assert(healthRes.status === 200 && healthJson.success === true, 'GET /api/health returns 200 publicly');

      const liveRes = await fetch(`${baseUrl}/api/health/live`);
      const liveJson: any = await liveRes.json();
      assert(liveRes.status === 200 && liveJson.status === 'live', 'GET /api/health/live returns 200 publicly');

      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
      assert(logoutRes.status === 200, 'POST /api/auth/logout returns 200 publicly');
    }

    // ------------------------------------------------------------------
    // 2. LOGIN FLOW, BACKWARD COMPATIBILITY & SAFE 401 RESPONSES
    // ------------------------------------------------------------------
    console.log('\n--- 2. Login Flow & Credential Error Handling ---');
    let adminToken = '';
    let residentToken = '';
    {
      // Wrong password -> must be HTTP 401 (not 500!)
      const badPassRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
      });
      const badPassJson: any = await badPassRes.json();
      assert(badPassRes.status === 401, `Invalid password returns HTTP 401 (got ${badPassRes.status})`);
      assert(badPassJson.success === false && !badPassJson.error, 'Invalid login response leaks no internal error object');

      // Missing fields -> HTTP 401
      const missingRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '', password: '' }),
      });
      assert(missingRes.status === 401, `Empty credentials return HTTP 401 (got ${missingRes.status})`);

      // Existing Admin login
      const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      });
      const adminJson: any = await adminRes.json();
      assert(adminRes.status === 200 && adminJson.success === true, 'Existing Admin login succeeds with HTTP 200');
      assert(typeof adminJson.data?.token === 'string' && adminJson.data.token.split('.').length === 3, 'Admin receives valid 3-part JWT');
      assert(!('password' in (adminJson.data?.user || {})), 'Admin login response NEVER exposes password hash');
      adminToken = adminJson.data.token;

      // Existing Customer (legacy penghuni) login
      const resRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'penghuni', password: 'penghuni123' }),
      });
      const resJson: any = await resRes.json();
      assert(resRes.status === 200 && resJson.data?.user?.role === 'CUSTOMER', 'Existing Customer login succeeds with HTTP 200');
      residentToken = resJson.data.token;
    }

    // ------------------------------------------------------------------
    // 3. TOKEN SECURITY EDGE CASES (INVALID, ALG=NONE, EXPIRED, GHOST USER)
    // ------------------------------------------------------------------
    console.log('\n--- 3. Token Rejection Security Edge Cases ---');
    {
      // alg=none attack
      const fakeHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const fakeBody = Buffer.from(JSON.stringify({ userId: 'x', username: 'admin', role: 'SUPER_ADMIN', exp: Date.now() + 60000 })).toString('base64url');
      const algNoneToken = `${fakeHeader}.${fakeBody}.`;
      assert(verifyToken(algNoneToken) === null, 'alg=none downgrade token rejected by verifyToken');

      const algNoneRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${algNoneToken}` },
      });
      assert(algNoneRes.status === 401, 'alg=none token rejected on API with HTTP 401');

      // Tampered token
      const tamperedRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${adminToken}tampered` },
      });
      assert(tamperedRes.status === 401, 'Tampered Bearer token rejected with HTTP 401');

      // Expired token
      const expiredToken = generateToken(
        { userId: '00000000-0000-4000-8000-000000000001', username: 'admin', role: 'SUPER_ADMIN' },
        -5000
      );
      const expiredRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert(expiredRes.status === 401, 'Expired Bearer token rejected with HTTP 401');

      // Validly signed token for deleted/non-existent user
      const ghostToken = generateToken({
        userId: '00000000-0000-4000-8000-000000000099',
        username: 'ghost',
        role: 'SUPER_ADMIN',
      });
      const ghostRes = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${ghostToken}` },
      });
      assert(ghostRes.status === 401, 'Valid JWT for non-existent DB user rejected with HTTP 401');
    }

    // ------------------------------------------------------------------
    // 4. DENY-BY-DEFAULT ROUTE PROTECTION (UNAUTHENTICATED -> 401)
    // ------------------------------------------------------------------
    console.log('\n--- 4. Private & Internal Endpoints Reject Anonymous Access (401) ---');
    const protectedEndpoints = [
      '/api/auth/me',
      '/api/health/ready',
      '/api/health/workers',
      '/api/health/full',
      '/api/health/db',
      '/api/houses',
      '/api/device-catalog',
      '/api/object-catalog',
      '/api/dashboard/overview',
      '/api/dashboard/floors',
      '/api/dashboard/rooms',
      '/api/dashboard/devices',
      '/api/dashboard/activities',
      '/api/dashboard/automation-summary',
      '/api/automations',
      '/api/automation/status',
      '/api/automation-executions',
      '/api/simulation/status',
      '/api/providers/status',
      '/api/providers/health',
      '/api/house-models',
      '/api/unclassified-unknown-route', // Deny-by-default check
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert(res.status === 401, `Anonymous GET ${ep} rejected with HTTP 401 (got ${res.status})`);
    }

    // ------------------------------------------------------------------
    // 5. AUTHENTICATED ACCESS ACROSS ALL EXISTING FEATURE MODULES
    // ------------------------------------------------------------------
    console.log('\n--- 5. Authenticated Requests Succeed Across All Feature Modules ---');
    const authHeaders = { Authorization: `Bearer ${adminToken}` };

    const defaultHouse = await prisma.house.findFirst();
    const houseQuery = defaultHouse ? `?houseId=${defaultHouse.id}` : '';

    const authGetEndpoints = [
      '/api/auth/me',
      '/api/health/workers',
      '/api/health/full',
      '/api/health/db',
      '/api/houses',
      '/api/device-catalog',
      '/api/object-catalog',
      `/api/dashboard/overview${houseQuery}`,
      `/api/dashboard/floors${houseQuery}`,
      `/api/dashboard/rooms${houseQuery}`,
      `/api/dashboard/devices${houseQuery}`,
      `/api/dashboard/activities${houseQuery}`,
      `/api/dashboard/automation-summary${houseQuery}`,
      '/api/automations',
      '/api/automation/status',
      '/api/automation-executions',
      '/api/simulation/status',
      '/api/providers/status',
      '/api/providers/health',
      '/api/house-models',
    ];

    for (const ep of authGetEndpoints) {
      const res = await fetch(`${baseUrl}${ep}`, { headers: authHeaders });
      assert(res.status === 200, `Authenticated GET ${ep} succeeds with HTTP 200 (got ${res.status})`);
    }

    // Unknown route with valid auth -> 404 Not Found
    const notFoundRes = await fetch(`${baseUrl}/api/unclassified-unknown-route`, { headers: authHeaders });
    assert(notFoundRes.status === 404, `Authenticated unknown route returns HTTP 404 (got ${notFoundRes.status})`);

    // Resident token on dashboard (Phase 4 state-gated policy: returns 200 if ACTIVE, 403 if DRAFT)
    const residentOverviewRes = await fetch(`${baseUrl}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${residentToken}` },
    });
    assert(
      residentOverviewRes.status === 200 || residentOverviewRes.status === 403,
      `Resident Bearer token accesses GET /api/dashboard/overview with valid state policy (got ${residentOverviewRes.status})`
    );

    // Binary streaming endpoints check (if data exists)
    const fpWithImg = await prisma.floorPlan.findFirst({ where: { imagePath: { not: null } } });
    if (fpWithImg) {
      const unauthImg = await fetch(`${baseUrl}/api/floor-plans/${fpWithImg.id}/image`);
      assert(unauthImg.status === 401, 'Anonymous GET /api/floor-plans/:id/image rejected with HTTP 401');

      const authImg = await fetch(`${baseUrl}/api/floor-plans/${fpWithImg.id}/image`, { headers: authHeaders });
      assert(authImg.status === 200 || authImg.status === 404, `Authenticated GET /api/floor-plans/:id/image passes auth gate (got ${authImg.status})`);
    }

    const existingModel = await prisma.houseModel.findFirst();
    if (existingModel) {
      const unauthGlb = await fetch(`${baseUrl}/api/house-models/${existingModel.id}/file`);
      assert(unauthGlb.status === 401, 'Anonymous GET /api/house-models/:id/file rejected with HTTP 401');

      const authGlb = await fetch(`${baseUrl}/api/house-models/${existingModel.id}/file`, { headers: authHeaders });
      assert(authGlb.status === 200 || authGlb.status === 404, `Authenticated GET /api/house-models/:id/file passes auth gate (got ${authGlb.status})`);
    }

    // ------------------------------------------------------------------
    // 6. PRISMA SINGLETON & CONNECTION LIFECYCLE
    // ------------------------------------------------------------------
    console.log('\n--- 6. Prisma Singleton & DB Connection Health ---');
    {
      assert(prisma === globalThis.__prismaInstance, 'db.service.ts exports the global singleton PrismaClient instance');

      const dbStatus = await checkDatabaseConnection();
      assert(dbStatus.isConnected === true, `Singleton PrismaClient DB health check connected (${dbStatus.latencyMs}ms)`);

      // Verify zero duplicate `new PrismaClient(` in runtime backend/src (excluding scripts/)
      const srcRoot = path.resolve(__dirname, '..');
      const runtimePrismaFiles: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === 'scripts') continue;
            walk(full);
          } else if (entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(full, 'utf8');
            if (/new\s+PrismaClient\s*\(/.test(content)) {
              runtimePrismaFiles.push(path.relative(srcRoot, full));
            }
          }
        }
      };
      walk(srcRoot);
      assert(
        runtimePrismaFiles.length === 1 && runtimePrismaFiles[0].endsWith('db.service.ts'),
        `Exactly 1 runtime PrismaClient instantiation exists (${runtimePrismaFiles.join(', ')})`
      );
    }

    // ------------------------------------------------------------------
    // 7. NON-DESTRUCTIVE SEED USERS CHECK
    // ------------------------------------------------------------------
    console.log('\n--- 7. Non-Destructive User Seeding ---');
    {
      const before = await prisma.user.findUnique({ where: { username: 'admin' }, select: { password: true } });
      await seedUsers();
      const after = await prisma.user.findUnique({ where: { username: 'admin' }, select: { password: true } });
      assert(before?.password === after?.password, 'Repeated seedUsers() preserves existing admin password hash');
    }

    // ------------------------------------------------------------------
    // 8. PRODUCTION ERROR SANITIZATION CHECK
    // ------------------------------------------------------------------
    console.log('\n--- 8. Production Error Sanitization ---');
    {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      let capturedStatus = 0;
      let capturedBody: any = null;
      const mockRes: any = {
        status(code: number) {
          capturedStatus = code;
          return {
            json(body: any) {
              capturedBody = body;
              return this;
            },
          };
        },
      };

      errorHandler(
        new Error('FATAL: password authentication failed for postgresql://postgres:secret@localhost:5432'),
        {} as any,
        mockRes,
        () => {}
      );

      process.env.NODE_ENV = prevEnv;
      assert(capturedStatus === 500, 'Unexpected error in production returns HTTP 500');
      assert(
        capturedBody &&
          !JSON.stringify(capturedBody).includes('postgresql://') &&
          !('error' in capturedBody),
        'Production 500 error strips DB URL and stack trace completely'
      );
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 1 TEST SUITE RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Tests().catch((err) => {
  console.error('❌ Unhandled Phase 1 test error:', err);
  process.exit(1);
});
