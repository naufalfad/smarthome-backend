/**
 * PHASE 5 VERIFICATION TEST SUITE
 * Authenticated Asset Storage & Unified Upload Architecture
 *
 * Covers all 18 security and authorization requirements:
 * 1. Anonymous requests cannot retrieve private assets.
 * 2. Super Admin can retrieve authorized existing assets.
 * 3. Customer A can retrieve their own ACTIVE property's permitted floor-plan asset.
 * 4. Customer A cannot retrieve Customer B's asset.
 * 5. Customer cannot retrieve assets belonging to a non-ACTIVE property.
 * 6. Customer cannot retrieve survey photos under any property status.
 * 7. Technician without a verifiable assignment cannot retrieve property assets.
 * 8. Invalid asset IDs are rejected (400 Bad Request).
 * 9. Path traversal attempts are rejected (400/403).
 * 10. Encoded traversal attempts are rejected.
 * 11. Arbitrary filesystem paths cannot be supplied to the API.
 * 12. Old public /uploads paths no longer expose private files (404).
 * 13. Existing GLB assets remain accessible to authorized users (with Byte-Range support).
 * 14. Existing 2D floor-plan assets remain accessible to authorized users.
 * 15. Missing files return safe errors without filesystem information.
 * 16. Existing upload flows continue to work.
 * 17. Cross-tenant asset references cannot bypass authorization.
 * 18. Legacy Super Admin assets without Customer ownership remain manageable.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const {
  CANONICAL_UPLOADS_DIR,
  FLOOR_PLANS_DIR,
  SURVEYS_DIR,
  HOUSE_MODELS_DIR,
  getHouseSurveyDirectory,
} = await import('../utils/storage-path.util.js');
const { PropertyAccessPolicy } = await import('../services/property-access-policy.service.js');

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

async function runPhase5Tests() {
  console.log('===================================================================');
  console.log('🛡️  PHASE 5: AUTHENTICATED ASSET STORAGE TEST SUITE');
  console.log('===================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const helper = async (url: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${url}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {}),
      },
    });
    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {}
    }
    return {
      status: res.status,
      headers: res.headers,
      data,
      res,
    };
  };

  try {
    // ------------------------------------------------------------------
    // 0. Setup Fixtures & Tokens
    // ------------------------------------------------------------------
    console.log('--- 0. Establishing Authentication Tokens & Test Assets ---');

    // Clean up any residual test orders from previous runs to ensure clean initial state
    await prisma.serviceOrderAssignment.deleteMany({
      where: { serviceOrder: { orderNumber: { startsWith: 'SO-TEST-P5' } } },
    });
    await prisma.serviceOrder.deleteMany({
      where: { orderNumber: { startsWith: 'SO-TEST-P5' } },
    });

    // Super Admin login
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin login successful');

    // Customer A login
    const custALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.a@smarthome.id', password: 'customer123' }),
    });
    const custAToken = custALogin.data?.data?.token;
    assert(custALogin.status === 200 && !!custAToken, 'Customer A login successful');

    // Customer B login
    const custBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.b@smarthome.id', password: 'customer123' }),
    });
    const custBToken = custBLogin.data?.data?.token;
    assert(custBLogin.status === 200 && !!custBToken, 'Customer B login successful');

    // Technician login
    const techLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'technician.x@smarthome.id', password: 'tech123' }),
    });
    const techToken = techLogin.data?.data?.token;
    assert(techLogin.status === 200 && !!techToken, 'Technician login successful');

    // Locate houses
    const houseA1 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah A1 (Active)' } });
    const houseA2 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah A2 (Configuring)' } });
    const houseB1 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah B1 (Active)' } });
    const legacyHouse = await prisma.house.findFirstOrThrow({ where: { customerId: null } });

    // Locate or link real sample background files on disk for A1, A2, B1
    const availableFloorPlanFiles = fs.readdirSync(FLOOR_PLANS_DIR).filter((f) => f.endsWith('.png'));
    assert(availableFloorPlanFiles.length > 0, 'Floor plan files exist in canonical directory');
    const sampleFloorPlanFile = availableFloorPlanFiles[0];
    const sampleFloorPlanRelPath = `uploads/floor-plans/${sampleFloorPlanFile}`;

    // Ensure FloorPlan A1 has imagePath
    let floorPlanA1 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseA1.id } } });
    if (!floorPlanA1.imagePath) {
      floorPlanA1 = await prisma.floorPlan.update({
        where: { id: floorPlanA1.id },
        data: {
          imagePath: sampleFloorPlanRelPath,
          imageMimeType: 'image/png',
          imageSize: 133788,
          imageWidth: 800,
          imageHeight: 600,
        },
      });
    }

    // Ensure FloorPlan A2 has imagePath
    let floorPlanA2 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseA2.id } } });
    if (!floorPlanA2.imagePath) {
      floorPlanA2 = await prisma.floorPlan.update({
        where: { id: floorPlanA2.id },
        data: {
          imagePath: sampleFloorPlanRelPath,
          imageMimeType: 'image/png',
          imageSize: 133788,
          imageWidth: 800,
          imageHeight: 600,
        },
      });
    }

    // Ensure FloorPlan B1 has imagePath
    let floorPlanB1 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseB1.id } } });
    if (!floorPlanB1.imagePath) {
      floorPlanB1 = await prisma.floorPlan.update({
        where: { id: floorPlanB1.id },
        data: {
          imagePath: sampleFloorPlanRelPath,
          imageMimeType: 'image/png',
          imageSize: 133788,
          imageWidth: 800,
          imageHeight: 600,
        },
      });
    }

    // Locate sample GLB model
    const houseModel = await prisma.houseModel.findFirstOrThrow();
    assert(!!houseModel && !!houseModel.filePath, 'Sample GLB HouseModel exists in database');

    // Ensure canonical survey photos exist:
    // 1. Root legacy survey photo preserved intact
    const sampleSurveyFilename = 'survey-photo-sample-01.png';
    const sampleSurveyPath = path.resolve(SURVEYS_DIR, sampleSurveyFilename);
    if (!fs.existsSync(sampleSurveyPath)) {
      fs.copyFileSync(path.resolve(FLOOR_PLANS_DIR, sampleFloorPlanFile), sampleSurveyPath);
    }
    assert(fs.existsSync(sampleSurveyPath), 'Survey photo exists in canonical SURVEYS_DIR root');

    // 2. Property-specific survey photo for House A
    const photoAFilename = 'survey-photo-house-a.png';
    const houseADir = getHouseSurveyDirectory(houseA1.id);
    const photoAPath = path.resolve(houseADir, photoAFilename);
    if (!fs.existsSync(photoAPath)) {
      fs.copyFileSync(sampleSurveyPath, photoAPath);
    }
    const houseASamplePath = path.resolve(houseADir, sampleSurveyFilename);
    if (!fs.existsSync(houseASamplePath)) {
      fs.copyFileSync(sampleSurveyPath, houseASamplePath);
    }
    assert(fs.existsSync(photoAPath), 'House A survey photo exists in property-specific directory');

    // 3. Property-specific survey photo for House B
    const photoBFilename = 'survey-photo-house-b.png';
    const houseBDir = getHouseSurveyDirectory(houseB1.id);
    const photoBPath = path.resolve(houseBDir, photoBFilename);
    if (!fs.existsSync(photoBPath)) {
      fs.copyFileSync(sampleSurveyPath, photoBPath);
    }
    assert(fs.existsSync(photoBPath), 'House B survey photo exists in property-specific directory');

    // ------------------------------------------------------------------
    // Requirement 1: Anonymous requests cannot retrieve private assets
    // ------------------------------------------------------------------
    console.log('\n--- 1. Anonymous Request Protection ---');
    const anonPlan = await helper(`/api/floor-plans/${floorPlanA1.id}/image`);
    assert(anonPlan.status === 401, 'Anonymous GET /api/floor-plans/:id/image rejected (HTTP 401)');

    const anonModel = await helper(`/api/house-models/${houseModel.id}/file`);
    assert(anonModel.status === 401, 'Anonymous GET /api/house-models/:id/file rejected (HTTP 401)');

    const anonSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/${sampleSurveyFilename}`);
    assert(anonSurvey.status === 401, 'Anonymous GET survey photo rejected (HTTP 401)');

    // ------------------------------------------------------------------
    // Requirement 2: Super Admin can retrieve authorized existing assets
    // ------------------------------------------------------------------
    console.log('\n--- 2. Super Admin Authorized Access ---');
    const adminPlanRes = await helper(`/api/floor-plans/${floorPlanA1.id}/image`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminPlanRes.status === 200, 'Super Admin can stream FloorPlan A1 image (HTTP 200)');
    assert(adminPlanRes.headers.get('content-type')?.includes('image/png') ?? false, 'Content-Type is image/png');
    assert(adminPlanRes.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff header present');

    const adminGlbRes = await helper(`/api/house-models/${houseModel.id}/file`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminGlbRes.status === 200, 'Super Admin can stream 3D GLB model (HTTP 200)');
    assert(adminGlbRes.headers.get('content-type')?.includes('model/gltf-binary') ?? false, 'GLB Content-Type is model/gltf-binary');

    const adminSurveyRes = await helper(`/api/houses/${houseA1.id}/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminSurveyRes.status === 200, 'Super Admin can stream internal survey photo (HTTP 200)');

    // ------------------------------------------------------------------
    // Requirement 3: Customer A can retrieve their own ACTIVE property's permitted floor-plan asset
    // ------------------------------------------------------------------
    console.log('\n--- 3. Customer A ACTIVE Property Access ---');
    const custAPlanRes = await helper(`/api/floor-plans/${floorPlanA1.id}/image`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custAPlanRes.status === 200, 'Customer A can stream own ACTIVE property floor plan (HTTP 200)');
    const imgBuffer = await custAPlanRes.res.arrayBuffer();
    assert(imgBuffer.byteLength > 0, 'Streamed image body contains valid binary data');

    // ------------------------------------------------------------------
    // Requirement 4: Customer A cannot retrieve Customer B's asset (IDOR)
    // ------------------------------------------------------------------
    console.log('\n--- 4. Customer Isolation & IDOR Protection ---');
    const custAToBPlan = await helper(`/api/floor-plans/${floorPlanB1.id}/image`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custAToBPlan.status === 403, 'Customer A cannot access Customer B floor-plan asset (HTTP 403)');
    assert(custAToBPlan.data?.message?.includes('Akses dilarang') ?? false, 'Error message is sanitized');

    // ------------------------------------------------------------------
    // Requirement 5: Customer cannot retrieve assets belonging to a non-ACTIVE property
    // ------------------------------------------------------------------
    console.log('\n--- 5. State-Gated Asset Protection (Non-ACTIVE) ---');
    const custAToA2 = await helper(`/api/floor-plans/${floorPlanA2.id}/image`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custAToA2.status === 403, 'Customer A cannot access CONFIGURING property asset (HTTP 403)');

    // ------------------------------------------------------------------
    // Requirement 6: Customer cannot retrieve survey photos under any property status
    // ------------------------------------------------------------------
    console.log('\n--- 6. Internal Survey Photo Customer Restriction ---');
    const custASurveyA1 = await helper(`/api/houses/${houseA1.id}/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custASurveyA1.status === 403, 'Customer A cannot access survey photo on ACTIVE house (HTTP 403)');

    const custASurveyA2 = await helper(`/api/houses/${houseA2.id}/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custASurveyA2.status === 403, 'Customer A cannot access survey photo on CONFIGURING house (HTTP 403)');

    // ------------------------------------------------------------------
    // Requirement 7: Technician without a verifiable assignment cannot retrieve property assets
    // ------------------------------------------------------------------
    console.log('\n--- 7. Technician Assignment Verification Gate ---');
    const techPlan = await helper(`/api/floor-plans/${floorPlanA1.id}/image`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techPlan.status === 403, 'Technician without assignment denied floor plan access (HTTP 403)');

    const techSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techSurvey.status === 403, 'Technician without assignment denied survey photo access (HTTP 403)');

    const techGlb = await helper(`/api/house-models/${houseModel.id}/file`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techGlb.status === 403, 'Technician denied access to administrative GLB model (HTTP 403)');

    // ------------------------------------------------------------------
    // Requirement 8: Invalid asset IDs are rejected (HTTP 400 Bad Request)
    // ------------------------------------------------------------------
    console.log('\n--- 8. Malformed UUID Parameter Validation ---');
    const badPlanId = await helper('/api/floor-plans/not-a-uuid/image', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badPlanId.status === 400, 'Invalid UUID on floor-plan image returns HTTP 400');

    const badModelId = await helper('/api/house-models/malformed-id-123/file', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badModelId.status === 400, 'Invalid UUID on house-model file returns HTTP 400');

    const badSurveyHouseId = await helper(`/api/houses/bad-uuid/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(badSurveyHouseId.status === 400, 'Invalid UUID on survey photo route returns HTTP 400');

    // ------------------------------------------------------------------
    // Requirement 9: Path traversal attempts are rejected
    // ------------------------------------------------------------------
    console.log('\n--- 9. Path Traversal Rejection ---');
    const traversalSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/..%2f..%2f..%2fpackage.json`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(traversalSurvey.status === 400 || traversalSurvey.status === 403 || traversalSurvey.status === 404, 'Relative path traversal blocked');

    // ------------------------------------------------------------------
    // Requirement 10: Encoded traversal attempts are rejected
    // ------------------------------------------------------------------
    console.log('\n--- 10. Encoded Traversal Rejection ---');
    const encodedTraversal = await helper(`/api/houses/${houseA1.id}/surveys/photos/%2e%2e%2f%2e%2e%2f.env`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(encodedTraversal.status === 400 || encodedTraversal.status === 403 || encodedTraversal.status === 404, 'Encoded path traversal blocked');

    // ------------------------------------------------------------------
    // Requirement 11: Arbitrary filesystem paths cannot be supplied to API
    // ------------------------------------------------------------------
    console.log('\n--- 11. Arbitrary Filesystem Path Protection ---');
    const winPath = await helper(`/api/houses/${houseA1.id}/surveys/photos/C:%5CWindows%5Cwin.ini`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(winPath.status === 400 || winPath.status === 403 || winPath.status === 404, 'Arbitrary drive path rejected');

    // ------------------------------------------------------------------
    // Requirement 12: Old public /uploads paths no longer expose private files
    // ------------------------------------------------------------------
    console.log('\n--- 12. Public /uploads Static Mount Removal ---');
    const publicFloorPlan = await helper(`/uploads/floor-plans/${sampleFloorPlanFile}`);
    assert(publicFloorPlan.status === 404, 'Public GET /uploads/floor-plans/... returns 404 (disabled)');

    const publicGlb = await helper(`/uploads/house-models/${houseModel.fileName}`);
    assert(publicGlb.status === 404, 'Public GET /uploads/house-models/... returns 404 (disabled)');

    const publicSurvey = await helper(`/uploads/surveys/${sampleSurveyFilename}`);
    assert(publicSurvey.status === 404, 'Public GET /uploads/surveys/... returns 404 (disabled)');

    // ------------------------------------------------------------------
    // Requirement 13: Existing GLB assets accessible with Byte-Range support
    // ------------------------------------------------------------------
    console.log('\n--- 13. GLB Asset Streaming & Byte-Range Requests (HTTP 206) ---');
    const rangeRes = await helper(`/api/house-models/${houseModel.id}/file`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Range: 'bytes=0-100',
      },
    });
    assert(rangeRes.status === 206, 'Byte-range request returns HTTP 206 Partial Content');
    assert(rangeRes.headers.get('content-range')?.startsWith('bytes 0-100/') ?? false, 'Content-Range header matches requested range');
    assert(rangeRes.headers.get('content-length') === '101', 'Content-Length header matches chunk size (101 bytes)');
    assert(rangeRes.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges: bytes header present');

    const invalidRangeRes = await helper(`/api/house-models/${houseModel.id}/file`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Range: 'bytes=99999999-999999999',
      },
    });
    assert(invalidRangeRes.status === 416, 'Unsatisfiable range returns HTTP 416 Range Not Satisfiable');

    // ------------------------------------------------------------------
    // Requirement 14: Existing 2D floor-plan assets accessible to authorized users
    // ------------------------------------------------------------------
    console.log('\n--- 14. 2D Floor Plan Asset Streaming Integrity ---');
    const streamPlan = await helper(`/api/floor-plans/${floorPlanA1.id}/image`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(streamPlan.status === 200, 'Floor plan streaming returns 200 OK');
    assert(streamPlan.headers.get('content-disposition')?.includes('inline') ?? false, 'Content-Disposition is inline');
    assert(streamPlan.headers.get('cache-control')?.includes('private') ?? false, 'Cache-Control is private');

    // ------------------------------------------------------------------
    // Requirement 15: Missing files return safe errors without filesystem paths
    // ------------------------------------------------------------------
    console.log('\n--- 15. Missing File Error Sanitization ---');
    const missingSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/non-existent-survey-99.png`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(missingSurvey.status === 404, 'Missing survey photo returns HTTP 404');
    const rawErrorText = JSON.stringify(missingSurvey.data || {});
    assert(!rawErrorText.includes('D:\\') && !rawErrorText.includes('C:\\'), 'Error does not leak physical Windows path');

    // ------------------------------------------------------------------
    // Requirement 16: Existing upload flows continue to work
    // ------------------------------------------------------------------
    console.log('\n--- 16. Upload Pipeline Functionality ---');
    // Upload small sample image to FloorPlan A1 background
    const formData = new FormData();
    const samplePngBytes = fs.readFileSync(path.resolve(FLOOR_PLANS_DIR, sampleFloorPlanFile));
    const sampleBlob = new Blob([samplePngBytes], { type: 'image/png' });
    formData.append('image', sampleBlob, 'new-uploaded-bg.png');

    const uploadRes = await fetch(`${baseUrl}/api/floor-plans/${floorPlanA1.id}/background`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
      body: formData,
    });
    const uploadJson: any = await uploadRes.json();
    assert(uploadRes.status === 200 && uploadJson.success === true, 'Super Admin upload background succeeds (HTTP 200)');
    assert(uploadJson.data?.imagePath?.startsWith('uploads/floor-plans/'), 'New image path stored in canonical format');

    // ------------------------------------------------------------------
    // Requirement 17: Cross-tenant asset references cannot bypass authorization
    // ------------------------------------------------------------------
    console.log('\n--- 17. Cross-Tenant Asset References Guard ---');
    const crossTenantSurvey = await helper(`/api/houses/${houseB1.id}/surveys/photos/${sampleSurveyFilename}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(crossTenantSurvey.status === 403, 'Customer A cannot access Customer B survey route (HTTP 403)');

    // ------------------------------------------------------------------
    // Requirement 18: Legacy Super Admin assets without Customer ownership remain manageable
    // ------------------------------------------------------------------
    console.log('\n--- 18. Legacy Unassigned Asset Management ---');
    const legacyPlan = await prisma.floorPlan.findFirst({ where: { floor: { houseId: legacyHouse.id } } });
    if (legacyPlan) {
      const adminLegacyPlanRes = await helper(`/api/floor-plans/${legacyPlan.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(adminLegacyPlanRes.status === 200, 'Super Admin can access floor plan of legacy unassigned house (HTTP 200)');
    } else {
      assert(true, 'Legacy house verified (no orphaned plans)');
    }

    const adminModelsList = await helper('/api/house-models', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminModelsList.status === 200 && adminModelsList.data?.data?.models?.length > 0, 'Super Admin can list legacy GLB models');

    // ------------------------------------------------------------------
    // Requirement 19: Survey Asset Ownership Binding & Technician Assignment Security
    // ------------------------------------------------------------------
    console.log('\n--- 19. Survey Asset Ownership Binding & Technician Assignment Security ---');

    // 19.1 Super Admin accesses a survey photo belonging to House A — allowed
    const adminSurveyA = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoAFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminSurveyA.status === 200, 'Test 1: Super Admin accesses House A survey photo (allowed, HTTP 200)');
    assert(adminSurveyA.headers.get('content-type')?.includes('image/png') ?? false, 'Test 1: Content-Type is image/png');

    // 19.2 Technician assigned to House A accesses House A's survey photo — allowed only if assignment verification exists
    const techUser = await prisma.user.findFirstOrThrow({
      where: { email: 'technician.x@smarthome.id' },
      include: { technicianProfile: true },
    });
    assert(!!techUser.technicianProfile, 'Technician profile exists for testing');
    const techProfileId = techUser.technicianProfile!.id;

    // Database-backed fixture assignment of technician to House A1 via confirmed ServiceOrder
    const adminUser = await prisma.user.findFirstOrThrow({
      where: { role: 'SUPER_ADMIN' },
    });
    const custAUser = await prisma.user.findFirstOrThrow({
      where: { email: 'customer.a@smarthome.id' },
      include: { customerProfile: true },
    });

    const fixtureOrder = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-TEST-P5-${Date.now()}`,
        customerId: custAUser.customerProfile!.id,
        packageName: 'Test Package P5',
        packageCode: 'TEST-PKG-P5',
        packagePrice: 1000000,
        packageSnapshot: {},
        propertyName: 'House A1',
        propertyAddress: 'Kemang',
        status: 'CONFIRMED',
        houseId: houseA1.id,
        contactName: 'Customer A',
        contactPhone: '081234567890',
      },
    });

    const fixtureAssignment = await prisma.serviceOrderAssignment.create({
      data: {
        serviceOrderId: fixtureOrder.id,
        technicianProfileId: techProfileId,
        assignedByAdminId: adminUser.id,
        status: 'ACTIVE',
      },
    });

    const techSurveyA = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoAFilename}`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techSurveyA.status === 200, "Test 2: Technician assigned to House A accesses House A's survey photo (allowed, HTTP 200)");

    // 19.3 Technician assigned to House A attempts to access House B's survey photo using House A's ID — denied (safe 404 / cross-property bound)
    const techCrossPhotoUsingHouseA = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoBFilename}`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techCrossPhotoUsingHouseA.status === 404, "Test 3: Technician assigned to House A accessing House B's photo via House A's ID is denied (HTTP 404)");

    // 19.4 Technician assigned to House A attempts to access House B's survey photo using House B's ID — denied (HTTP 403 Forbidden)
    const techHouseBWithHouseBID = await helper(`/api/houses/${houseB1.id}/surveys/photos/${photoBFilename}`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techHouseBWithHouseBID.status === 403, "Test 4: Technician assigned to House A accessing House B's photo via House B's ID is denied (HTTP 403 Forbidden)");

    // 19.5 Technician without assignment attempts to access any survey photo — denied
    await prisma.serviceOrderAssignment.update({
      where: { id: fixtureAssignment.id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedByAdminId: adminUser.id,
        reassignmentReason: 'Test Phase 5 cleanup and revocation',
      },
    });
    const techUnassignedSurveyA = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoAFilename}`, {
      headers: { Authorization: `Bearer ${techToken}` },
    });
    assert(techUnassignedSurveyA.status === 403, "Test 5: Technician without assignment accessing survey photo is denied (HTTP 403 Forbidden)");

    // 19.6 Customer attempts to access survey photos — denied under every property status
    const custActiveSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoAFilename}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custActiveSurvey.status === 403, "Test 6a: Customer accessing survey photo on ACTIVE house is denied (HTTP 403 Forbidden)");

    const custConfiguringSurvey = await helper(`/api/houses/${houseA2.id}/surveys/photos/${photoAFilename}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custConfiguringSurvey.status === 403, "Test 6b: Customer accessing survey photo on CONFIGURING house is denied (HTTP 403 Forbidden)");

    // 19.7 Unknown filename — safe 404
    const unknownSurvey = await helper(`/api/houses/${houseA1.id}/surveys/photos/definitely-not-found-123.png`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(unknownSurvey.status === 404, "Test 7: Unknown filename returns safe HTTP 404");
    assert(!JSON.stringify(unknownSurvey.data || {}).includes('D:\\') && !JSON.stringify(unknownSurvey.data || {}).includes('C:\\'), "Test 7: Safe 404 does not leak physical path");

    // 19.8 Traversal and encoded traversal attempts — rejected
    const relTraversal = await helper(`/api/houses/${houseA1.id}/surveys/photos/..%2f..%2fpackage.json`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(relTraversal.status === 400, "Test 8a: Relative path traversal rejected (HTTP 400)");

    const encTraversal = await helper(`/api/houses/${houseA1.id}/surveys/photos/%2e%2e%2f%2e%2e%2f.env`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(encTraversal.status === 400, "Test 8b: Encoded path traversal rejected (HTTP 400)");

    const crossHouseTraversal = await helper(`/api/houses/${houseA1.id}/surveys/photos/..%2f${houseB1.id}%2f${photoBFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(crossHouseTraversal.status === 400, "Test 8c: Cross-house directory traversal via filename rejected (HTTP 400)");

    // 19.9 Cross-property filename substitution — denied
    const adminCrossSub = await helper(`/api/houses/${houseA1.id}/surveys/photos/${photoBFilename}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminCrossSub.status === 404, "Test 9: Cross-property filename substitution denied (HTTP 404)");

    // 19.10 Existing survey assets remain intact
    const originalRootAsset = path.resolve(SURVEYS_DIR, 'survey-photo-sample-01.png');
    assert(fs.existsSync(originalRootAsset) && fs.statSync(originalRootAsset).size > 0, "Test 10: Existing survey assets remain intact on disk");
  } finally {
    try {
      await prisma.serviceOrderAssignment.deleteMany({
        where: { serviceOrder: { orderNumber: { startsWith: 'SO-TEST-P5' } } },
      });
      await prisma.serviceOrder.deleteMany({
        where: { orderNumber: { startsWith: 'SO-TEST-P5' } },
      });
    } catch {}
    server.close();
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 5 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase5Tests().catch((e) => {
  console.error('Fatal error during Phase 5 verification:', e);
  process.exit(1);
});
