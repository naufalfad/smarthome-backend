import http from 'http';
import fs from 'fs';
import path from 'path';
import { app } from '../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let server: http.Server;
const TEST_PORT = 5055;
const BASE = `http://localhost:${TEST_PORT}/api`;

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function run() {
  console.log('====================================================');
  console.log('🌐 PHASE 2: FULL HTTP REST API INTEGRATION SUITE');
  console.log('====================================================\n');

  // Start temporary test HTTP server
  await new Promise<void>((resolve) => {
    server = app.listen(TEST_PORT, () => resolve());
  });

  try {
    // 1. Houses
    console.log('🏠 1. House & Floor Endpoints');
    const resHouses = await fetch(`${BASE}/houses`);
    const jsonHouses: any = await resHouses.json();
    assert(resHouses.status === 200 && jsonHouses.success, 'GET /api/houses returns 200 OK');
    assert(jsonHouses.data.length >= 1, 'At least 1 house returned');
    const testHouse = jsonHouses.data[0];

    const resNewFloor = await fetch(`${BASE}/houses/${testHouse.id}/floors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Lantai Uji API', levelNumber: 99 }),
    });
    const jsonNewFloor: any = await resNewFloor.json();
    assert(resNewFloor.status === 201 && jsonNewFloor.success, 'POST /api/houses/:id/floors creates floor (201 Created)');
    const testFloor = jsonNewFloor.data;

    // 2. Floor Plan
    console.log('\n📐 2. Floor Plan Canvas Endpoints');
    const resPlan = await fetch(`${BASE}/floor-plans/by-floor/${testFloor.id}`);
    const jsonPlan: any = await resPlan.json();
    assert(resPlan.status === 200 && jsonPlan.success, 'GET /api/floor-plans/by-floor/:floorId returns plan (200 OK)');
    const testPlan = jsonPlan.data;

    const resUpdateConfig = await fetch(`${BASE}/floor-plans/${testPlan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Floor Plan Name', backgroundOpacity: 0.85, isBackgroundVisible: true }),
    });
    const jsonUpdateConfig: any = await resUpdateConfig.json();
    assert(resUpdateConfig.status === 200 && jsonUpdateConfig.data.backgroundOpacity === 0.85, 'PATCH /api/floor-plans/:id updates configuration');

    // 3. Object Catalog
    console.log('\n🛋️ 3. Object Catalog Endpoints');
    const resCatalog = await fetch(`${BASE}/object-catalog`);
    const jsonCatalog: any = await resCatalog.json();
    assert(resCatalog.status === 200 && jsonCatalog.data.length === 27, 'GET /api/object-catalog returns all 27 seeded items');

    const resCategories = await fetch(`${BASE}/object-catalog/categories`);
    const jsonCategories: any = await resCategories.json();
    assert(resCategories.status === 200 && jsonCategories.data.length === 5, 'GET /api/object-catalog/categories returns 5 categories');

    const firstCat = jsonCatalog.data[0];
    const resSingleCat = await fetch(`${BASE}/object-catalog/${firstCat.id}`);
    const jsonSingleCat: any = await resSingleCat.json();
    assert(resSingleCat.status === 200 && jsonSingleCat.data.id === firstCat.id, 'GET /api/object-catalog/:id returns single catalog asset');

    const resAssetStream = await fetch(`${BASE}/object-catalog/${firstCat.id}/asset`);
    assert(resAssetStream.status === 200 && (resAssetStream.headers.get('content-type')?.includes('svg') ?? false), 'GET /api/object-catalog/:id/asset streams SVG asset');

    // 4. Object Instances
    console.log('\n📦 4. Floor Plan Object CRUD Endpoints');
    const resCreateObj = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        catalogObjectId: firstCat.id,
        name: 'Test Living Sofa Instance',
        category: firstCat.category,
        x: 250,
        y: 180,
        width: 140,
        height: 70,
        rotation: 90,
      }),
    });
    const jsonCreateObj: any = await resCreateObj.json();
    assert(resCreateObj.status === 201 && jsonCreateObj.success, 'POST /api/floor-plans/:id/objects creates object instance (201 Created)');
    const createdObj = jsonCreateObj.data;

    const resUpdateObj = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects/${createdObj.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 300, y: 220, rotation: 180 }),
    });
    const jsonUpdateObj: any = await resUpdateObj.json();
    assert(resUpdateObj.status === 200 && jsonUpdateObj.data.x === 300 && jsonUpdateObj.data.rotation === 180, 'PATCH /api/floor-plans/:id/objects/:objectId updates coordinates and rotation');

    const resDuplicateObj = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects/${createdObj.id}/duplicate`, {
      method: 'POST',
    });
    const jsonDuplicateObj: any = await resDuplicateObj.json();
    assert(resDuplicateObj.status === 201 && jsonDuplicateObj.data.id !== createdObj.id, 'POST /api/floor-plans/:id/objects/:objectId/duplicate clones instance');
    const clonedObj = jsonDuplicateObj.data;

    const resBatch = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects/batch`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: [
          { id: createdObj.id, zIndex: 10 },
          { id: clonedObj.id, zIndex: 20 },
        ],
      }),
    });
    const jsonBatch: any = await resBatch.json();
    assert(resBatch.status === 200 && jsonBatch.data.length === 2, 'PUT /api/floor-plans/:id/objects/batch updates z-indexes');

    // 5. Two-Point Scale Calibration
    console.log('\n📏 5. Scale Calibration Endpoint');
    const resCalib = await fetch(`${BASE}/floor-plans/${testPlan.id}/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        point1: { x: 0, y: 0 },
        point2: { x: 300, y: 0 },
        distanceMeters: 3.0,
      }),
    });
    const jsonCalib: any = await resCalib.json();
    assert(resCalib.status === 200 && jsonCalib.data.isCalibrated === true && jsonCalib.data.pixelsPerMeter === 100, 'POST /api/floor-plans/:id/calibration calculates 100 px/meter');

    // 6. Background Image Upload & Decoupling
    console.log('\n🖼️ 6. Background Upload & Decoupling Endpoints');
    // Multipart upload
    const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000004000000028008060000009c9527f40000000a49444154789c63000100000500010d0a2d400000000049454e44ae426082', 'hex');
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="floorplan.png"\r\nContent-Type: image/png\r\n\r\n`),
      png1x1,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const resUploadBg = await fetch(`${BASE}/floor-plans/${testPlan.id}/background`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });
    const jsonUploadBg: any = await resUploadBg.json();
    assert(resUploadBg.status === 200 && jsonUploadBg.data.imagePath !== null, 'POST /api/floor-plans/:id/background uploads PNG background');

    const resStreamImg = await fetch(`${BASE}/floor-plans/${testPlan.id}/image`);
    assert(resStreamImg.status === 200 && (resStreamImg.headers.get('content-type')?.includes('image') ?? false), 'GET /api/floor-plans/:id/image streams background');

    // Verify objects still exist
    const resListObjects = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects`);
    const jsonListObjects: any = await resListObjects.json();
    assert(jsonListObjects.data.length === 2, 'Objects preserved after background upload');

    // Delete background
    const resDelBg = await fetch(`${BASE}/floor-plans/${testPlan.id}/background`, { method: 'DELETE' });
    const jsonDelBg: any = await resDelBg.json();
    assert(resDelBg.status === 200 && jsonDelBg.data.imagePath === null, 'DELETE /api/floor-plans/:id/background resets imagePath');

    const resListObjectsAfterDel = await fetch(`${BASE}/floor-plans/${testPlan.id}/objects`);
    const jsonListObjectsAfterDel: any = await resListObjectsAfterDel.json();
    assert(jsonListObjectsAfterDel.data.length === 2, 'Objects STILL preserved after background deletion');

    // Cleanup test floor
    await prisma.floor.delete({ where: { id: testFloor.id } });

    // 7. Legacy 3D Regression Check
    console.log('\n🏛️ 7. Legacy 3D Regression Verification');
    const res3dModels = await fetch(`${BASE}/house-models`);
    const json3dModels: any = await res3dModels.json();
    assert(res3dModels.status === 200 && json3dModels.success, 'GET /api/house-models (Legacy 3D) works perfectly');

    const res3dAda = await fetch(`${BASE}/house-models/51a065ca-85e1-4c35-88c7-be5b684c6250`);
    const json3dAda: any = await res3dAda.json();
    assert(res3dAda.status === 200 && json3dAda.data.name === 'Ada', 'Legacy 3D model "Ada" retrieved without error');

    const res3dAdaIdents = await fetch(`${BASE}/house-models/51a065ca-85e1-4c35-88c7-be5b684c6250/identifications`);
    const json3dAdaIdents: any = await res3dAdaIdents.json();
    const identsCount = Array.isArray(json3dAdaIdents.data) ? json3dAdaIdents.data.length : 0;
    assert(res3dAdaIdents.status === 200 && identsCount === 20, 'Legacy 3D model "Ada" has all 20 identifications intact');

    console.log('\n====================================================');
    console.log(`📊 TOTAL HTTP API TESTS: ${passed} passed, ${failed} failed`);
    console.log('====================================================\n');
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('HTTP test failed:', err);
  if (server) server.close();
  process.exit(1);
});
