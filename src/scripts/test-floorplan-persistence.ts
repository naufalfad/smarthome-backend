import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { FloorPlanService } from '../services/floor-plan.service.js';
import { resolveUploadPath, FLOOR_PLANS_DIR, ROOT_FLOOR_PLANS_DIR } from '../utils/storage-path.util.js';
import { app } from '../server.js';
import http from 'http';

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string, detail?: any) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`, detail || '');
    failed++;
  }
}

async function run() {
  console.log('====================================================');
  console.log('🔍 VERIFICATION: FLOOR PLAN BACKGROUND PERSISTENCE & STORAGE');
  console.log('====================================================\n');

  // Test 1: Check existing real floors background integrity
  console.log('--- 1. Real Data Integrity Verification ---');
  const villa = await prisma.house.findFirst({
    where: { name: 'Villa Sentosa' },
    include: { floors: { include: { floorPlan: true } } },
  });
  assert(!!villa, 'Villa Sentosa house exists in database');
  if (villa) {
    const l1 = villa.floors.find((f) => f.levelNumber === 1);
    assert(!!l1?.floorPlan?.imagePath, `Lantai 1 has background imagePath (${l1?.floorPlan?.imagePath})`);
    if (l1?.floorPlan?.imagePath) {
      const resolvedL1 = resolveUploadPath(l1.floorPlan.imagePath);
      assert(!!resolvedL1 && fs.existsSync(resolvedL1), `Lantai 1 background exists on disk: ${resolvedL1}`);
    }

    const l2 = villa.floors.find((f) => f.levelNumber === 2);
    assert(!!l2?.floorPlan, `Lantai 2 floor plan exists in database`);
    if (l2?.floorPlan?.imagePath) {
      const resolvedL2 = resolveUploadPath(l2.floorPlan.imagePath);
      assert(!!resolvedL2 && fs.existsSync(resolvedL2), `Lantai 2 background exists on disk: ${resolvedL2}`);
    }
  }

  // Test 2: Upload, Persistence & Decoupling with an Isolated Test House
  console.log('\n--- 2. Isolated Upload & Stream API Verification ---');
  const testHouse = await prisma.house.create({
    data: {
      name: `Persistence Test House ${Date.now()}`,
      floors: {
        create: {
          name: 'Lantai Uji Persistensi',
          levelNumber: 1,
        },
      },
    },
    include: { floors: { include: { floorPlan: true } } },
  });

  const testFloor = testHouse.floors[0];
  const testPlan = await FloorPlanService.getPlanByFloorId(testFloor.id);
  assert(!!testPlan, 'Created test floor plan');

  // Create a 1x1 valid PNG test buffer
  const samplePngBuffer = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
    'hex'
  );
  const testFileName = `test-bg-${Date.now()}.png`;
  const tempFilePath = path.resolve(FLOOR_PLANS_DIR, testFileName);
  fs.writeFileSync(tempFilePath, samplePngBuffer);

  const mockMulterFile: Express.Multer.File = {
    fieldname: 'image',
    originalname: 'test-diagram.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: samplePngBuffer.length,
    destination: FLOOR_PLANS_DIR,
    filename: testFileName,
    path: tempFilePath,
    buffer: samplePngBuffer,
    stream: fs.createReadStream(tempFilePath),
  };

  const updatedPlan = await FloorPlanService.setBackground(testPlan.id, mockMulterFile);
  assert(!!updatedPlan.imagePath, `Background uploaded and saved: ${updatedPlan.imagePath}`);
  assert(updatedPlan.imagePath === `uploads/floor-plans/${testFileName}`, 'Path is standardized relative path');

  // Verify file exists in both backend and root uploads directories
  const inBackendDir = path.resolve(FLOOR_PLANS_DIR, testFileName);
  const inRootDir = path.resolve(ROOT_FLOOR_PLANS_DIR, testFileName);
  assert(fs.existsSync(inBackendDir), `File exists in backend storage: ${inBackendDir}`);
  assert(fs.existsSync(inRootDir), `File synced to root storage: ${inRootDir}`);

  // Test 3: HTTP Streaming Endpoint
  console.log('\n--- 3. HTTP Stream Endpoint Verification ---');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5098, () => resolve()));

  try {
    const res = await fetch(`http://localhost:5098/api/floor-plans/${testPlan.id}/image`);
    assert(res.status === 200, `GET /api/floor-plans/:id/image returns 200 OK (Status: ${res.status})`);
    const cType = res.headers.get('content-type');
    assert(cType?.includes('image/png') ?? false, `Content-Type is image/png (Got: ${cType})`);
    const imgBuf = await res.arrayBuffer();
    assert(imgBuf.byteLength === samplePngBuffer.length, `Streamed bytes match uploaded buffer (${imgBuf.byteLength} bytes)`);

    // Verify static serving under /uploads
    const resStatic = await fetch(`http://localhost:5098/uploads/floor-plans/${testFileName}`);
    assert(resStatic.status === 200, `GET /uploads/floor-plans/:file returns 200 via Express static`);

    // Delete background
    console.log('\n--- 4. Clean Background Deletion ---');
    const cleanedPlan = await FloorPlanService.deleteBackground(testPlan.id);
    assert(cleanedPlan.imagePath === null, 'deleteBackground resets imagePath in database to null');
    assert(!fs.existsSync(inBackendDir), 'Physical file removed from backend storage directory');
  } finally {
    server.close();
    // Cleanup temporary test house
    await prisma.floorPlanObject.deleteMany({ where: { floorPlan: { floor: { houseId: testHouse.id } } } });
    await prisma.floorPlan.deleteMany({ where: { floor: { houseId: testHouse.id } } });
    await prisma.floor.deleteMany({ where: { houseId: testHouse.id } });
    await prisma.house.delete({ where: { id: testHouse.id } });
  }

  // Test 5: Verify Villa Sentosa was NOT touched
  console.log('\n--- 5. Verify User Data Pristine Post-Tests ---');
  const villaPost = await prisma.house.findFirst({
    where: { name: 'Villa Sentosa' },
    include: { floors: { include: { floorPlan: true } } },
  });
  const l1Post = villaPost?.floors.find((f) => f.levelNumber === 1);
  const l2Post = villaPost?.floors.find((f) => f.levelNumber === 2);
  assert(!!l1Post?.floorPlan?.imagePath, `Villa Sentosa Lantai 1 background REMAINS INTACT: ${l1Post?.floorPlan?.imagePath}`);
  assert(!!l2Post?.floorPlan, `Villa Sentosa Lantai 2 floor plan REMAINS INTACT`);

  console.log('\n====================================================');
  console.log(`📊 PERSISTENCE TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

run()
  .catch((e) => {
    console.error('Fatal error in persistence test:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

