/**
 * TEST AUTHENTICATION & ROLE-BASED ACCESS CONTROL (RBAC)
 * 
 * Tests:
 * 1. Password hashing & scrypt verification
 * 2. JWT token generation & verification (RFC 7519)
 * 3. AuthService.login for Admin & Resident
 * 4. AuthService.login error handling (wrong password, non-existent user)
 * 5. AuthService.getProfile
 * 6. Auth middleware (authenticateToken & requireRole)
 */

import '../config/env.js';
import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword, generateToken, verifyToken } from '../utils/auth-crypto.util.js';
import { AuthService } from '../services/auth.service.js';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware.js';
import { seedUsers } from './seed-users.js';

const prisma = new PrismaClient();

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

async function runAuthTests() {
  console.log('====================================================');
  console.log('🔐 TESTING AUTHENTICATION & ROLE-BASED ACCESS CONTROL');
  console.log('====================================================\n');

  // Ensure users are seeded
  await seedUsers();

  // -------------------------------------------------------------
  // TEST GROUP 1: Crypto & Password Hashing
  // -------------------------------------------------------------
  console.log('--- 1. Password Hashing & Verification (scrypt) ---');
  {
    const plain = 'superSecretPassword123!';
    const hash = hashPassword(plain);

    assert(hash.includes(':'), 'Hash tersimpan dalam format salt:derivedKey');
    assert(verifyPassword(plain, hash), 'Kata sandi benar berhasil diverifikasi');
    assert(!verifyPassword('wrongPassword', hash), 'Kata sandi salah ditolak');
    assert(!verifyPassword('', hash), 'Kata sandi kosong ditolak');
  }

  // -------------------------------------------------------------
  // TEST GROUP 2: JWT Generation & Verification
  // -------------------------------------------------------------
  console.log('\n--- 2. JWT Generation & Verification (RFC 7519) ---');
  {
    const token = generateToken({
      userId: 'test-user-id-123',
      username: 'testadmin',
      role: 'SUPER_ADMIN',
    });

    assert(typeof token === 'string' && token.split('.').length === 3, 'JWT berformat 3 bagian (Header.Payload.Signature)');

    const payload = verifyToken(token);
    assert(payload !== null, 'Token valid berhasil diverifikasi');
    assert(payload?.username === 'testadmin', 'Payload username sesuai');
    assert(payload?.role === 'SUPER_ADMIN', 'Payload role sesuai');

    // Tampered token check
    const tampered = token.slice(0, -5) + 'xxxxx';
    const tamperedPayload = verifyToken(tampered);
    assert(tamperedPayload === null, 'Token yang dimanipulasi ditolak signature-nya');

    // Expired token check
    const expiredToken = generateToken({
      userId: 'test-user-id-123',
      username: 'testadmin',
      role: 'SUPER_ADMIN',
    }, -1000); // Expired in past
    assert(verifyToken(expiredToken) === null, 'Token kadaluwarsa ditolak');
  }

  // -------------------------------------------------------------
  // TEST GROUP 3: AuthService Login (Super Admin vs Customer)
  // -------------------------------------------------------------
  console.log('\n--- 3. AuthService Login (Super Admin vs Customer) ---');
  {
    // 3A. Login Super Admin
    const adminLogin = await AuthService.login('admin', 'admin123');
    assert(typeof adminLogin.token === 'string', 'Login Super Admin menghasilkan token JWT');
    assert(adminLogin.user.role === 'SUPER_ADMIN', 'Role pengguna Super Admin bernilai SUPER_ADMIN');
    assert(adminLogin.user.username === 'admin', 'Username Super Admin bernilai admin');

    // 3B. Login Legacy Customer (penghuni)
    const residentLogin = await AuthService.login('penghuni', 'penghuni123');
    assert(typeof residentLogin.token === 'string', 'Login Customer menghasilkan token JWT');
    assert(residentLogin.user.role === 'CUSTOMER', 'Role pengguna Customer bernilai CUSTOMER');
    assert(residentLogin.user.username === 'penghuni', 'Username legacy Customer bernilai penghuni');
    assert(residentLogin.user.houseId !== undefined, 'Customer legacy memiliki asosiasi houseId');

    // 3C. Invalid Password
    let wrongPassBlocked = false;
    try {
      await AuthService.login('admin', 'salahPassword');
    } catch (err: any) {
      wrongPassBlocked = true;
      assert(err.message.includes('tidak valid'), 'Pesan error kata sandi salah informatif');
    }
    assert(wrongPassBlocked, 'Login dengan kata sandi salah berhasil ditolak');

    // 3D. Non-existent Username
    let nonExistentBlocked = false;
    try {
      await AuthService.login('userGhaib', 'password123');
    } catch (err: any) {
      nonExistentBlocked = true;
      assert(err.message.includes('tidak valid'), 'Pesan error pengguna tidak terdaftar');
    }
    assert(nonExistentBlocked, 'Login dengan username tidak terdaftar ditolak');
  }

  // -------------------------------------------------------------
  // TEST GROUP 4: Profile Retrieval
  // -------------------------------------------------------------
  console.log('\n--- 4. Profile Retrieval ---');
  {
    const adminUser = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (adminUser) {
      const profile = await AuthService.getProfile(adminUser.id);
      assert(profile.id === adminUser.id, 'Profil Super Admin berhasil diambil');
      assert(profile.role === 'SUPER_ADMIN', 'Role profil Super Admin valid');
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 5: Auth & RBAC Middleware
  // -------------------------------------------------------------
  console.log('\n--- 5. RBAC Middleware Guards ---');
  {
    const seededAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });
    const seededResident = await prisma.user.findUnique({ where: { username: 'penghuni' } });

    const adminToken = generateToken({
      userId: seededAdmin!.id,
      username: seededAdmin!.username,
      role: 'SUPER_ADMIN',
    });

    const ghostToken = generateToken({
      userId: '00000000-0000-4000-8000-000000000000',
      username: 'deleted-user',
      role: 'SUPER_ADMIN',
    });

    // 5A. authenticateToken without header -> 401
    let unauthCode = 0;
    const reqNoAuth: any = { headers: {} };
    const resNoAuth: any = {
      status: (c: number) => {
        unauthCode = c;
        return { json: () => {} };
      },
    };
    await authenticateToken(reqNoAuth, resNoAuth, () => {});
    assert(unauthCode === 401, 'Request tanpa header Authorization ditolak dengan HTTP 401');

    // 5B. authenticateToken with valid token for real user -> passes
    let authNext = false;
    const reqAuth: any = { headers: { authorization: `Bearer ${adminToken}` } };
    await authenticateToken(reqAuth, {} as any, () => {
      authNext = true;
    });
    assert(authNext, 'Request dengan Bearer token valid memanggil next()');
    assert(reqAuth.user?.role === 'SUPER_ADMIN', 'req.user terisi dari record user valid di database');

    // 5B-2. authenticateToken with token for non-existent user -> 401
    let ghostCode = 0;
    let ghostNext = false;
    const reqGhost: any = { headers: { authorization: `Bearer ${ghostToken}` } };
    const resGhost: any = {
      status: (c: number) => {
        ghostCode = c;
        return { json: () => {} };
      },
    };
    await authenticateToken(reqGhost, resGhost, () => {
      ghostNext = true;
    });
    assert(!ghostNext && ghostCode === 401, 'Token valid untuk user yang tidak ada di DB ditolak HTTP 401');

    // 5C. requireRole('SUPER_ADMIN') with Super Admin user -> passes
    let adminRoleNext = false;
    const adminReq: any = { user: { role: 'SUPER_ADMIN', userId: seededAdmin!.id } };
    requireRole('SUPER_ADMIN')(adminReq, {} as any, () => {
      adminRoleNext = true;
    });
    assert(adminRoleNext, 'requireRole(SUPER_ADMIN) meloloskan pengguna SUPER_ADMIN');

    // 5D. requireRole('SUPER_ADMIN') with Customer user -> blocks with 403 Forbidden
    let residentDeniedCode = 0;
    let residentDeniedNext = false;
    const residentReq: any = { user: { role: 'CUSTOMER', userId: seededResident?.id } };
    const residentRes: any = {
      status: (c: number) => {
        residentDeniedCode = c;
        return { json: () => {} };
      },
    };
    requireRole('SUPER_ADMIN')(residentReq, residentRes, () => {
      residentDeniedNext = true;
    });
    assert(!residentDeniedNext, 'requireRole(SUPER_ADMIN) menahan pengguna CUSTOMER');
    assert(residentDeniedCode === 403, 'requireRole(SUPER_ADMIN) mengembalikan HTTP 403 Forbidden untuk CUSTOMER');

    // 5E. requireRole('SUPER_ADMIN', 'TECHNICIAN', 'CUSTOMER') passes CUSTOMER
    let bothNext = false;
    requireRole('SUPER_ADMIN', 'TECHNICIAN', 'CUSTOMER')(residentReq, {} as any, () => {
      bothNext = true;
    });
    assert(bothNext, 'requireRole(SUPER_ADMIN, TECHNICIAN, CUSTOMER) meloloskan pengguna CUSTOMER');
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`📊 HASIL PENGUJIAN AUTH & RBAC: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Unhandled error during Auth tests:', err);
  process.exit(1);
});

