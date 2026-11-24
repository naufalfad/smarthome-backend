/**
 * PHASE 9: SECURITY, RELIABILITY & PRODUCTION READINESS TEST SUITE
 * 
 * Tests:
 * 1. Security Headers & Express Configuration
 * 2. File Upload Hardening (Magic Bytes & Signatures)
 * 3. Path Traversal & Containment Validation
 * 4. UUID Route Parameter Validation Middleware
 * 5. Request Body Sanitization Middleware
 * 6. Rate Limiting Mechanism & Threshold Enforcement
 * 7. Observability Probes (Liveness & Worker Diagnostics)
 * 8. Prisma Error Translation & Safety
 * 9. Device Command Reliability & Dangling Recovery (Database connected)
 */

import { PrismaClient } from '@prisma/client';
import { validateImageSignature } from '../utils/image-dimensions.js';
import { resolveUploadPath, isPathContained } from '../utils/storage-path.util.js';
import { validateUuidParam, sanitizeRequestBody } from '../middlewares/validation.middleware.js';
import { securityHeadersMiddleware } from '../middlewares/security-headers.middleware.js';
import { createRateLimiter } from '../middlewares/rate-limiter.middleware.js';
import { errorHandler } from '../middlewares/error.middleware.js';
import { DeviceManagementService } from '../services/device-management.service.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import { VirtualDeviceProvider } from '../providers/virtual/virtual-device.provider.js';
import { getSystemHealth, getWorkersHealth, getReadiness } from '../services/health.service.js';
import path from 'path';
import fs from 'fs';

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

async function runPhase9Tests() {
  console.log('================================================================');
  console.log('🛡️  PHASE 9: SECURITY, RELIABILITY & PRODUCTION READINESS SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // TEST GROUP 1: Security Headers & Middleware
  // -------------------------------------------------------------
  console.log('--- 1. HTTP Security Headers ---');
  {
    const headersSet: Record<string, string> = {};
    const mockReq: any = { secure: true, headers: {} };
    const mockRes: any = {
      setHeader: (key: string, val: string) => {
        headersSet[key] = val;
      },
    };
    let nextCalled = false;
    securityHeadersMiddleware(mockReq, mockRes, () => {
      nextCalled = true;
    });

    assert(nextCalled, 'Security headers middleware memanggil next()');
    assert(headersSet['X-Content-Type-Options'] === 'nosniff', 'Header X-Content-Type-Options di-set nosniff');
    assert(headersSet['X-Frame-Options'] === 'SAMEORIGIN', 'Header X-Frame-Options di-set SAMEORIGIN');
    assert(headersSet['X-XSS-Protection'] === '1; mode=block', 'Header X-XSS-Protection aktif');
    assert(headersSet['Cross-Origin-Resource-Policy'] === 'cross-origin', 'Header Cross-Origin-Resource-Policy di-set');
    assert(typeof headersSet['Content-Security-Policy'] === 'string', 'Content-Security-Policy terpasang');
    assert(headersSet['Strict-Transport-Security'] !== undefined, 'HSTS terpasang untuk koneksi HTTPS');
  }

  // -------------------------------------------------------------
  // TEST GROUP 2: File Upload Magic Bytes Signature Validation
  // -------------------------------------------------------------
  console.log('\n--- 2. File Upload Hardening (Magic Bytes Verification) ---');
  {
    // Valid PNG Buffer (89 50 4E 47 0D 0A 1A 0A)
    const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const resPng = validateImageSignature(validPngBuffer);
    assert(resPng.isValid && resPng.mimeType === 'image/png', 'Valid PNG magic bytes diterima tanpa error');

    // Valid JPEG Buffer (FF D8 FF E0)
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const resJpg = validateImageSignature(validJpgBuffer);
    assert(resJpg.isValid && resJpg.mimeType === 'image/jpeg', 'Valid JPEG magic bytes diterima tanpa error');

    // Spoofed malicious file (.png extension containing PHP/JS payload)
    const spoofedBuffer = Buffer.from('<?php eval($_POST["cmd"]); ?>', 'utf8');
    const resSpoof = validateImageSignature(spoofedBuffer);
    assert(!resSpoof.isValid, 'File PHP/malicious yang dinamai .png berhasil ditolak');
    assert(resSpoof.error?.includes('Tanda tangan berkas (magic bytes) tidak valid') === true, 'Pesan error signature spesifik menolak spoofed payload');

    // Truncated tiny buffer (< 4 bytes)
    const tinyBuffer = Buffer.from([0x89, 0x50]);
    const resTiny = validateImageSignature(tinyBuffer);
    assert(!resTiny.isValid, 'File yang terpotong (< 4 bytes) ditolak');
  }

  // -------------------------------------------------------------
  // TEST GROUP 3: Path Traversal & Containment Protection
  // -------------------------------------------------------------
  console.log('\n--- 3. Path Traversal & Containment Protection ---');
  {
    // Traversal sequence with relative parents
    const maliciousPath1 = '../../../../etc/passwd';
    const resolved1 = resolveUploadPath(maliciousPath1);
    assert(resolved1 === null, 'Directory traversal relative "../../../../etc/passwd" berhasil ditolak (returns null)');

    const maliciousPath2 = '..\\..\\Windows\\System32\\cmd.exe';
    const resolved2 = resolveUploadPath(maliciousPath2);
    assert(resolved2 === null, 'Directory traversal Windows "..\\..\\cmd.exe" berhasil ditolak (returns null)');

    // Legitimate upload relative path using a temporary containment test file
    const tempTestFile = path.resolve(process.cwd(), 'uploads/floor-plans/temp-p9-containment.png');
    fs.mkdirSync(path.dirname(tempTestFile), { recursive: true });
    fs.writeFileSync(tempTestFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    try {
      const resolvedSafe = resolveUploadPath('temp-p9-containment.png');
      assert(resolvedSafe !== null, 'Path upload valid berhasil di-resolve');
      if (resolvedSafe) {
        const allowedRoots = [
          path.resolve(process.cwd(), 'uploads'),
          path.resolve(process.cwd(), '..', 'uploads'),
        ];
        const isContained = allowedRoots.some(r => isPathContained(resolvedSafe, [r]));
        assert(isContained, 'Path yang di-resolve terbukti terkungkung (contained) dalam direktori upload yang sah');
      }
    } finally {
      if (fs.existsSync(tempTestFile)) {
        fs.unlinkSync(tempTestFile);
      }
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 4: UUID Route Parameter Validation Middleware
  // -------------------------------------------------------------
  console.log('\n--- 4. UUID Route Parameter Validation ---');
  {
    const validator = validateUuidParam('id', 'houseId');

    // Valid UUID v4
    let validNext = false;
    let validStatusCode = 0;
    const validReq: any = { params: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', houseId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' } };
    const validRes: any = {
      status: (code: number) => {
        validStatusCode = code;
        return { json: () => {} };
      },
    };
    validator(validReq, validRes, () => {
      validNext = true;
    });
    assert(validNext && validStatusCode === 0, 'UUID v4 valid diterima dan next() dipanggil');

    // Invalid non-UUID parameter
    let invalidNext = false;
    let invalidStatusCode = 0;
    let invalidJsonPayload: any = null;
    const invalidReq: any = { params: { id: 'invalid-id-or-sql-injection-123' } };
    const invalidRes: any = {
      status: (code: number) => {
        invalidStatusCode = code;
        return {
          json: (payload: any) => {
            invalidJsonPayload = payload;
          },
        };
      },
    };
    validator(invalidReq, invalidRes, () => {
      invalidNext = true;
    });
    assert(!invalidNext, 'ID non-UUID tidak memanggil next()');
    assert(invalidStatusCode === 400, 'ID non-UUID mengembalikan status HTTP 400');
    assert(invalidJsonPayload?.message.includes('UUID yang valid'), 'Pesan error format UUID informatif');
  }

  // -------------------------------------------------------------
  // TEST GROUP 5: Request Body Sanitization Middleware
  // -------------------------------------------------------------
  console.log('\n--- 5. Request Body Sanitization ---');
  {
    const dirtyReq: any = {
      body: {
        deviceName: 'Smart Lamp\0 Hacker Injection',
        config: {
          location: '  Living Room \0 ',
          nestedList: [' clean ', 'dirty\0nullbyte'],
        },
        numericVal: 42,
        boolVal: true,
      },
    };
    let sanitizeNext = false;
    sanitizeRequestBody(dirtyReq, {} as any, () => {
      sanitizeNext = true;
    });
    assert(sanitizeNext, 'Sanitize request body memanggil next()');
    assert(dirtyReq.body.deviceName === 'Smart Lamp Hacker Injection', 'Null-byte berhasil dieliminasi dari string');
    assert(dirtyReq.body.config.location === 'Living Room', 'Whitespace leading/trailing dan null-byte dibersihkan');
    assert(dirtyReq.body.config.nestedList[1] === 'dirtynullbyte', 'Array string tersanitasi secara rekursif');
    assert(dirtyReq.body.numericVal === 42 && dirtyReq.body.boolVal === true, 'Tipe non-string (number/boolean) tetap terjaga');
  }

  // -------------------------------------------------------------
  // TEST GROUP 6: Rate Limiting Mechanics
  // -------------------------------------------------------------
  console.log('\n--- 6. Rate Limiting Mechanism ---');
  {
    const limiter = createRateLimiter({
      windowMs: 60 * 1000,
      maxRequests: 3,
      message: 'Rate limit test reached',
    });

    const mockIpReq: any = { ip: '192.168.1.99', headers: {} };
    let blockedCode = 0;
    let blockedMessage = '';
    const mockRes: any = {
      status: (c: number) => {
        blockedCode = c;
        return {
          json: (b: any) => {
            blockedMessage = b.message;
          },
        };
      },
      setHeader: () => {},
    };

    let hitsPassed = 0;
    for (let i = 0; i < 3; i++) {
      limiter(mockIpReq, mockRes, () => {
        hitsPassed++;
      });
    }
    assert(hitsPassed === 3, '3 request pertama dalam kuota berhasil diproses');

    // 4th request should trigger rate limit rejection (HTTP 429)
    limiter(mockIpReq, mockRes, () => {
      hitsPassed++;
    });
    assert(hitsPassed === 3, 'Request ke-4 tidak memanggil next()');
    assert(blockedCode === 429, 'Request melebihi batas kuota ditolak dengan HTTP 429 Too Many Requests');
    assert(blockedMessage === 'Rate limit test reached', 'Pesan rate limiter sesuai konfigurasi');
  }

  // -------------------------------------------------------------
  // TEST GROUP 7: Centralized Error Middleware & Prisma Translation
  // -------------------------------------------------------------
  console.log('\n--- 7. Error Middleware & Prisma Translation ---');
  {
    // Simulate Prisma unique constraint error P2002
    const prismaError: any = new Error('Unique constraint failed on the fields: (`name`)');
    prismaError.code = 'P2002';
    prismaError.meta = { target: ['name'] };

    let sentCode = 0;
    let sentPayload: any = null;
    const mockErrRes: any = {
      status: (c: number) => {
        sentCode = c;
        return {
          json: (p: any) => {
            sentPayload = p;
          },
        };
      },
    };

    errorHandler(prismaError, { url: '/api/devices', method: 'POST' } as any, mockErrRes, () => {});
    assert(sentCode === 409, 'Prisma P2002 (Duplicate) dipetakan ke HTTP 409 Conflict');
    assert(sentPayload?.message.includes('sudah terdaftar'), 'Pesan error translasi ramah pengguna');

    // Simulate Prisma record not found error P2025
    const notFoundError: any = new Error('An operation failed because it depends on one or more records that were required but not found.');
    notFoundError.code = 'P2025';

    errorHandler(notFoundError, { url: '/api/devices/xyz', method: 'GET' } as any, mockErrRes, () => {});
    assert(sentCode === 404, 'Prisma P2025 (Record not found) dipetakan ke HTTP 404 Not Found');
  }

  // -------------------------------------------------------------
  // TEST GROUP 8: Observability Probes (Liveness & Worker Diagnostics)
  // -------------------------------------------------------------
  console.log('\n--- 8. Observability Probes & Health Checks ---');
  {
    // Liveness
    const systemHealth = getSystemHealth();
    assert(typeof systemHealth.uptimeSeconds === 'number' && systemHealth.uptimeSeconds >= 0, 'Liveness probe mengembalikan uptime numeric');
    assert(typeof systemHealth.memoryUsageMb?.rss === 'number', 'Liveness probe melaporkan pemakaian memory RSS');

    // Worker Diagnostics
    const workers = await getWorkersHealth();
    assert(workers.simulationEngine !== undefined, 'Worker probe memantau status Background Simulation Engine');
    assert(workers.automationEngine !== undefined, 'Worker probe memantau status Background Automation Engine');
    assert(typeof workers.simulationEngine.isRunning === 'boolean', 'Status isRunning Simulation Scheduler teridentifikasi');
    assert(typeof workers.automationEngine.isRunning === 'boolean', 'Status isRunning Automation Engine teridentifikasi');
  }

  // -------------------------------------------------------------
  // TEST GROUP 9: Database & Command Reliability (If DB reachable)
  // -------------------------------------------------------------
  console.log('\n--- 9. Database Integrity & Command Reliability ---');
  try {
    const readiness = await getReadiness();
    assert(readiness.database.isConnected === true, 'Readiness probe memvalidasi koneksi database PostgreSQL');
    assert(readiness.database.latencyMs !== undefined && readiness.database.latencyMs >= 0, 'Pemeriksaan latency koneksi database PostgreSQL valid');

    // Setup virtual provider for test
    const registry = DeviceProviderRegistry.getInstance();
    const virtualProvider = new VirtualDeviceProvider();
    registry.registerProvider(virtualProvider);
    await registry.initializeAll();

    const existingDevice = await prisma.device.findFirst({ where: { houseId: { not: null } } });
    const house = existingDevice?.houseId
      ? await prisma.house.findUnique({ where: { id: existingDevice.houseId } })
      : await prisma.house.findFirst();
    if (house) {
      let createdTempDevice = false;
      let testDevice =
        existingDevice && existingDevice.houseId === house.id
          ? existingDevice
          : await prisma.device.findFirst({ where: { houseId: house.id } });
      if (!testDevice) {
        testDevice = await prisma.device.create({
          data: {
            houseId: house.id,
            name: 'P9 Test Lamp',
            type: 'SMART_LIGHT',
            status: 'OFF',
            configuration: { brightness: 100 },
          },
        });
        createdTempDevice = true;
      }

      // Simulate a dangling command created 30 mins ago
      const pastDate = new Date(Date.now() - 30 * 60 * 1000);
      const stuckCommand = await prisma.deviceCommand.create({
        data: {
          deviceId: testDevice.id,
          commandType: 'SET_POWER',
          payload: { power: true },
          status: 'PENDING',
          createdAt: pastDate,
        },
      });

      assert(stuckCommand.status === 'PENDING', 'Stuck command berhasil disimulasikan di database');

      // Recover dangling commands
      const recoveredCount = await DeviceManagementService.recoverDanglingCommands(10);
      assert(recoveredCount >= 1, `recoverDanglingCommands memulihkan ${recoveredCount} command tertahan`);

      const updatedCommand = await prisma.deviceCommand.findUnique({ where: { id: stuckCommand.id } });
      assert(Boolean(updatedCommand && updatedCommand.status === 'FAILED'), 'Status command tertahan berhasil dialihkan menjadi FAILED');
      assert(
        Boolean(updatedCommand?.errorMessage?.includes('restart server atau waktu tunggu habis')),
        'Pesan error command mencatat timeout / restart server'
      );

      // Clean up test command and temporary device if created
      await prisma.deviceCommand.delete({ where: { id: stuckCommand.id } }).catch(() => {});
      if (createdTempDevice) {
        await prisma.device.delete({ where: { id: testDevice.id } }).catch(() => {});
      }
    } else {
      console.log('  ⚠️  [SKIP] Database tidak memiliki data House untuk pengujian command');
    }
  } catch (err: any) {
    console.error('  ❌ [FAIL] Database connectivity / command reliability test error:', err.message);
    failed++;
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 HASIL PENGUJIAN PHASE 9: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  await prisma.$disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9Tests().catch((err) => {
  console.error('Unhandled error during Phase 9 tests:', err);
  process.exit(1);
});
