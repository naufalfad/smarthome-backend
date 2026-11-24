/**
 * PHASE 10 INTEGRATION TEST SUITE:
 * 2D FLOOR PLAN CAD, SCALE CALIBRATION & ROOM POLYGON MODELING
 *
 * Verifies:
 * - P10-01: Blueprint Upload, Directory Containment & Authenticated Streaming
 * - P10-02: SVG Blueprint Upload & Malicious SVG XSS Prevention
 * - P10-03: Interactive Scale Calibration Math & Persistence (pixelsPerMeter)
 * - P10-04: Calibration Validation Guard (rejects non-positive distance & coincident points)
 * - P10-05: Metric Grid Snapping Preference Persistence (gridSnap)
 * - P10-06: Room Polygon Association & Shoelace Formula Area Calculation (m²)
 * - P10-07: Automatic Recalculation of Room Areas on Scale Recalibration
 * - P10-08: State-Gated Customer Access Barrier (HTTP 403 on CONFIGURING property)
 * - P10-09: Multi-Tenant Technician IDOR Isolation (Unassigned technician blocked with HTTP 403)
 * - P10-10: Immediate Technician Access Revocation upon Assignment Revocation
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { Prisma, AssignmentStatus, ServiceOrderStatus, PropertySetupStatus, RoomType } from '@prisma/client';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { PropertyAccessPolicy } = await import('../services/property-access-policy.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');
const {
  FLOOR_PLANS_DIR,
  getHouseFloorPlanDirectory,
  resolveHouseFloorPlanPath,
  isPathContained,
} = await import('../utils/storage-path.util.js');

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

async function runPhase10IntegrationTest() {
  console.log('===================================================================');
  console.log('⚡ PHASE 10: 2D FLOOR PLAN CAD, SCALE CALIBRATION & ROOM MODELING');
  console.log('===================================================================\n');

  const uniqueTag = Date.now().toString(36).toLowerCase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const helper = async (url: string, options: any = {}) => {
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (!isFormData && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${baseUrl}${url}`, {
      ...options,
      headers,
    });

    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch { }
    } else {
      try {
        data = await res.text();
      } catch { }
    }

    return { status: res.status, data, headers: res.headers };
  };

  // Fixtures cleanup tracking
  const createdUserIds: string[] = [];
  const createdHouseIds: string[] = [];
  const createdOrderIds: string[] = [];
  const filesToCleanup: string[] = [];

  try {
    console.log('--- 0. Preparing Phase 10 Test Fixtures ---');

    // 1. Admin login
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(Boolean(adminToken), 'Super Admin login successfully generates auth token');

    // 2. Create Customer
    const customerPasswordHash = await hashPassword('customer123');
    const customerUser: any = await prisma.user.create({
      data: {
        username: `p10cust_${uniqueTag}`,
        email: `p10cust_${uniqueTag}@test.com`,
        password: customerPasswordHash,
        name: 'Phase 10 Test Customer',
        role: 'CUSTOMER',
        customerProfile: {
          create: {
            fullName: 'Phase 10 Test Customer',
            phone: '081234567890',
            billingAddress: 'Jl. Phase 10 Blueprint No. 1',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(customerUser.id);

    const customerLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p10cust_${uniqueTag}`, password: 'customer123' }),
    });
    const customerToken = customerLogin.data?.data?.token;
    assert(Boolean(customerToken), 'Customer login successfully generates auth token');

    // 3. Create Assigned Technician A
    const techPasswordHash = await hashPassword('tech12345');
    const technicianAUser: any = await prisma.user.create({
      data: {
        username: `p10techa_${uniqueTag}`,
        email: `p10techa_${uniqueTag}@test.com`,
        password: techPasswordHash,
        name: 'Phase 10 Technician A',
        role: 'TECHNICIAN',
        technicianProfile: {
          create: {
            employeeCode: `TECH-P10-A-${uniqueTag.toUpperCase()}`,
            specialization: 'CAD & Surveying',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(technicianAUser.id);

    const techALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p10techa_${uniqueTag}`, password: 'tech12345' }),
    });
    const techAToken = techALogin.data?.data?.token;
    assert(Boolean(techAToken), 'Assigned Technician A login successfully generates auth token');

    // 4. Create Unassigned Technician B
    const technicianBUser: any = await prisma.user.create({
      data: {
        username: `p10techb_${uniqueTag}`,
        email: `p10techb_${uniqueTag}@test.com`,
        password: techPasswordHash,
        name: 'Phase 10 Technician B',
        role: 'TECHNICIAN',
        technicianProfile: {
          create: {
            employeeCode: `TECH-P10-B-${uniqueTag.toUpperCase()}`,
            specialization: 'Electrical Only',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(technicianBUser.id);

    const techBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p10techb_${uniqueTag}`, password: 'tech12345' }),
    });
    const techBToken = techBLogin.data?.data?.token;
    assert(Boolean(techBToken), 'Unassigned Technician B login successfully generates auth token');

    // 5. Create Canonical House & Floor from Phase 9 survey baseline (setupStatus: CONFIGURING)
    const house = await prisma.house.create({
      data: {
        name: `Casa Phase 10 CAD Studio - ${uniqueTag}`,
        description: 'Canonical house created by Phase 9 survey verification',
        propertyType: 'HOUSE',
        setupStatus: PropertySetupStatus.CONFIGURING,
        customerId: customerUser.customerProfile!.id,
        floors: {
          create: {
            name: 'Lantai 1 Utama',
            levelNumber: 1,
            floorPlan: {
              create: {
                name: 'Lantai 1 Utama Plan',
                viewBoxWidth: 1600,
                viewBoxHeight: 1000,
                gridSnap: true,
              },
            },
            rooms: {
              create: [
                {
                  name: 'Ruang Tamu Utama',
                  type: RoomType.LIVING_ROOM,
                  color: '#6366F1',
                  polygonCoordinates: Prisma.DbNull,
                  areaSquareMeters: null,
                },
                {
                  name: 'Kamar Tidur Utama',
                  type: RoomType.BEDROOM,
                  color: '#3B82F6',
                  polygonCoordinates: Prisma.DbNull,
                  areaSquareMeters: null,
                },
              ],
            },
          },
        },
      },
      include: {
        floors: {
          include: {
            floorPlan: true,
            rooms: true,
          },
        },
      },
    });
    createdHouseIds.push(house.id);

    const floor = house.floors[0];
    const floorPlan = floor.floorPlan!;
    const livingRoom = floor.rooms.find((r) => r.type === RoomType.LIVING_ROOM)!;
    const bedRoom = floor.rooms.find((r) => r.type === RoomType.BEDROOM)!;

    assert(Boolean(floorPlan), 'Canonical FloorPlan entity exists from setup');
    assert(livingRoom.polygonCoordinates === null, 'Phase 9 Room initially has null polygonCoordinates');
    assert(livingRoom.areaSquareMeters === null, 'Phase 9 Room initially has null areaSquareMeters');

    // 6. Create ServiceOrder & ACTIVE Assignment for Technician A
    const order = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P10-${uniqueTag}`,
        customerId: customerUser.customerProfile.id,
        packageName: 'Phase 10 Test Package',
        packageCode: 'PKG-P10',
        packagePrice: new Prisma.Decimal('10000000.00'),
        packageSnapshot: { name: 'Phase 10 Test Package' },
        propertyName: `Casa Phase 10 CAD Studio - ${uniqueTag}`,
        propertyAddress: 'Jl. Phase 10 Blueprint No. 1',
        status: ServiceOrderStatus.CONFIRMED,
        houseId: house.id,
        assignments: {
          create: {
            technicianProfileId: technicianAUser.technicianProfile.id,
            status: AssignmentStatus.ACTIVE,
            assignedByAdminId: adminLogin.data.data.user.id,
            assignedAt: new Date(),
          },
        },
      },
    });
    createdOrderIds.push(order.id);

    // Verify live DB assignment check
    const isTechAAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
      technicianAUser.technicianProfile!.id,
      house.id
    );
    const isTechBAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
      technicianBUser.technicianProfile!.id,
      house.id
    );
    assert(isTechAAssigned === true, 'Technician A holds live ACTIVE assignment on house');
    assert(isTechBAssigned === false, 'Technician B does not hold assignment on house');

    console.log('\n--- 1. Testing Blueprint Upload, Scoped Directory Containment & Streaming ---');

    // P10-01: Blueprint Upload
    // Prepare valid 100x100 PNG buffer
    const validPngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAnSURBVHgB7cEBDAMAAAMgu/q3VmMHAAAAAAAAAAAAAPw0tO8AAQf/7mQAAAAASUVORK5CYII=',
      'base64'
    );

    const formData = new FormData();
    const blob = new Blob([validPngBuffer], { type: 'image/png' });
    formData.append('image', blob, 'blueprint-floor1.png');

    const uploadRes = await helper(`/api/floor-plans/${floorPlan.id}/background`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${techAToken}`,
      },
      body: formData,
    });

    assert(uploadRes.status === 200, 'Assigned Technician A successfully uploads blueprint PNG (HTTP 200)');
    assert(uploadRes.data?.success === true, 'Blueprint upload response returns success: true');
    assert(
      uploadRes.data?.data?.imagePath?.startsWith(`uploads/floor-plans/${house.id}/`),
      `Blueprint imagePath is scoped to property directory: '${uploadRes.data?.data?.imagePath}'`
    );

    // Verify directory containment
    const houseBlueprintDir = getHouseFloorPlanDirectory(house.id);
    assert(fs.existsSync(houseBlueprintDir), 'Property-scoped blueprint directory created on disk');
    const storedFilename = path.basename(uploadRes.data?.data?.imagePath);
    const resolvedPathCheck = resolveHouseFloorPlanPath(house.id, storedFilename);
    assert(resolvedPathCheck !== null, 'resolveHouseFloorPlanPath validates path containment successfully');
    assert(
      isPathContained(resolvedPathCheck!.absolutePath, [houseBlueprintDir, FLOOR_PLANS_DIR]),
      'Target blueprint file is strictly contained within uploads/floor-plans/{houseId}/'
    );

    // Authenticated streaming tests
    const streamAdmin = await helper(`/api/floor-plans/${floorPlan.id}/image`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(streamAdmin.status === 200, 'Super Admin streams background image successfully (HTTP 200)');
    assert(streamAdmin.headers.get('content-type') === 'image/png', 'Background stream has correct MIME image/png');

    const streamTechA = await helper(`/api/floor-plans/${floorPlan.id}/image`, {
      headers: { Authorization: `Bearer ${techAToken}` },
    });
    assert(streamTechA.status === 200, 'Assigned Technician A streams background image successfully (HTTP 200)');

    const streamTechB = await helper(`/api/floor-plans/${floorPlan.id}/image`, {
      headers: { Authorization: `Bearer ${techBToken}` },
    });
    assert(streamTechB.status === 403, 'Unassigned Technician B blocked from streaming image (HTTP 403 Forbidden)');

    const streamCust = await helper(`/api/floor-plans/${floorPlan.id}/image`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(streamCust.status === 403, 'Customer strictly blocked from streaming WIP image on non-ACTIVE house (HTTP 403 Forbidden)');

    console.log('\n--- 2. Testing SVG Blueprint Upload & Malicious Script Prevention ---');

    // P10-02: Valid SVG Blueprint Upload
    const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 1200" width="2000" height="1200"><rect width="2000" height="1200" fill="#ffffff"/><path d="M 100 100 L 1900 100 L 1900 1100 L 100 1100 Z" fill="none" stroke="#000000" stroke-width="4"/></svg>`;
    const svgFormData = new FormData();
    svgFormData.append('image', new Blob([validSvg], { type: 'image/svg+xml' }), 'architecture.svg');

    const uploadSvgRes = await helper(`/api/floor-plans/${floorPlan.id}/background`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: svgFormData,
    });
    assert(uploadSvgRes.status === 200, 'Assigned Technician A successfully uploads vector SVG blueprint (HTTP 200)');
    assert(uploadSvgRes.data?.data?.imageMimeType === 'image/svg+xml', 'SVG blueprint parsed with image/svg+xml MIME');
    assert(uploadSvgRes.data?.data?.imageWidth === 2000, 'SVG intrinsic width 2000px parsed from viewBox');
    assert(uploadSvgRes.data?.data?.imageHeight === 1200, 'SVG intrinsic height 1200px parsed from viewBox');

    // Malicious SVG upload containing script
    const evilSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert("xss")</script><rect width="100" height="100" fill="red"/></svg>`;
    const evilSvgForm = new FormData();
    evilSvgForm.append('image', new Blob([evilSvg], { type: 'image/svg+xml' }), 'evil.svg');

    const evilUploadRes = await helper(`/api/floor-plans/${floorPlan.id}/background`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: evilSvgForm,
    });
    assert(evilUploadRes.status === 400 || evilUploadRes.status === 500, 'Malicious SVG containing script is rejected by security validator');

    console.log('\n--- 3. Testing Interactive Scale Calibration & Validation Guard ---');

    // P10-03 & P10-04: Scale Calibration Math & Persistence
    // Point A: (100, 100), Point B: (700, 100). Pixel distance = 600 px.
    // Real distance = 12.0 meters => pixelsPerMeter = 600 / 12 = 50.0 px/m.
    const calibPayload = {
      point1: { x: 100, y: 100 },
      point2: { x: 700, y: 100 },
      distanceMeters: 12.0,
    };

    const calibRes = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify(calibPayload),
    });

    assert(calibRes.status === 200, 'Assigned Technician A saves scale calibration successfully (HTTP 200)');
    assert(calibRes.data?.data?.isCalibrated === true, 'FloorPlan isCalibrated updated to true');
    assert(calibRes.data?.data?.pixelsPerMeter === 50, 'Scale ratio calculated accurately: 600px / 12m = 50.0 px/m');
    assert(calibRes.data?.data?.calibrationPoints?.distanceMeters === 12, 'CalibrationPoints distanceMeters persisted');
    assert(calibRes.data?.data?.calibrationPoints?.pixelDistance === 600, 'CalibrationPoints pixelDistance persisted');

    // Negative / Zero distance validation guard
    const invalidDistRes = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        point1: { x: 100, y: 100 },
        point2: { x: 700, y: 100 },
        distanceMeters: -5.0,
      }),
    });
    assert(invalidDistRes.status === 400 || invalidDistRes.status === 500, 'Negative distance rejected with error status');

    // Coincident points validation guard
    const samePointsRes = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        point1: { x: 200, y: 200 },
        point2: { x: 200, y: 200 },
        distanceMeters: 5.0,
      }),
    });
    assert(samePointsRes.status === 400 || samePointsRes.status === 500, 'Coincident points (0 px distance) rejected with error status');

    console.log('\n--- 4. Testing Metric Grid Snapping Preference Persistence ---');

    // P10-05: gridSnap toggle
    const snapTrueRes = await helper(`/api/floor-plans/${floorPlan.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ gridSnap: true }),
    });
    assert(snapTrueRes.status === 200, 'Update plan config with gridSnap: true succeeds (HTTP 200)');
    assert(snapTrueRes.data?.data?.gridSnap === true, 'gridSnap: true reflected in API response');

    const snapFalseRes = await helper(`/api/floor-plans/${floorPlan.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ gridSnap: false }),
    });
    assert(snapFalseRes.status === 200, 'Update plan config with gridSnap: false succeeds (HTTP 200)');
    assert(snapFalseRes.data?.data?.gridSnap === false, 'gridSnap: false reflected in API response');

    // Re-enable gridSnap
    await helper(`/api/floor-plans/${floorPlan.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ gridSnap: true }),
    });

    console.log('\n--- 5. Testing Room Polygon CAD & Shoelace Area Calculation ---');

    // P10-06: Room polygon coordinates & Shoelace area calculation
    // Living Room Rectangular polygon:
    // (100, 100) -> (350, 100) -> (350, 300) -> (100, 300)
    // Width = 250 px, Height = 200 px => Pixel Area = 250 * 200 = 50,000 px²
    // Scale = 50 px/m => 50² = 2500 px²/m² => Expected Real Area = 50000 / 2500 = 20.00 m²
    const livingRoomPolygon = [
      { x: 100, y: 100 },
      { x: 350, y: 100 },
      { x: 350, y: 300 },
      { x: 100, y: 300 },
    ];

    const polyRes = await helper(`/api/rooms/${livingRoom.id}/polygon`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ polygonCoordinates: livingRoomPolygon }),
    });

    assert(polyRes.status === 200, 'Assigned Technician A saves room polygon successfully (HTTP 200)');
    assert(polyRes.data?.data?.areaPx === 50000, 'Polygon pixel area calculated via Shoelace formula: 50,000 px²');
    assert(polyRes.data?.data?.areaSquareMeters === 20, 'Room real area converted to 20.00 m² based on 50 px/m scale');
    assert(polyRes.data?.data?.room?.areaSquareMeters === 20, 'Room entity areaSquareMeters persisted as 20 m² in DB');
    assert(
      Array.isArray(polyRes.data?.data?.room?.polygonCoordinates) &&
      polyRes.data?.data?.room?.polygonCoordinates.length === 4,
      'Room polygon coordinates array persisted in database'
    );

    // Bed Room Triangular polygon:
    // (400, 100) -> (600, 100) -> (400, 300)
    // Base = 200 px, Height = 200 px => Area = (200 * 200) / 2 = 20,000 px²
    // Scale = 50 px/m => 20000 / 2500 = 8.00 m²
    const bedRoomPolygon = [
      { x: 400, y: 100 },
      { x: 600, y: 100 },
      { x: 400, y: 300 },
    ];

    const bedPolyRes = await helper(`/api/rooms/${bedRoom.id}/polygon`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ polygonCoordinates: bedRoomPolygon }),
    });
    assert(bedPolyRes.status === 200, 'Bed Room triangular polygon saved successfully');
    assert(bedPolyRes.data?.data?.areaPx === 20000, 'Triangular Shoelace area calculated: 20,000 px²');
    assert(bedPolyRes.data?.data?.areaSquareMeters === 8, 'Bed Room area converted to 8.00 m²');

    console.log('\n--- 6. Testing Dynamic Recalculation on Scale Recalibration ---');

    // P10-07: Recalibrating scale dynamically recalculates room areas
    // Recalibrate to 25.0 px/m:
    // Point A (100, 100) to Point B (700, 100) (600px) with distance 24.0 m => 600 / 24 = 25.0 px/m
    // Living Room (50,000 px²) with 25 px/m => 50000 / (25 * 25) = 50000 / 625 = 80.00 m²
    // Bed Room (20,000 px²) with 25 px/m => 20000 / 625 = 32.00 m²
    const recalibRes = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        point1: { x: 100, y: 100 },
        point2: { x: 700, y: 100 },
        distanceMeters: 24.0,
      }),
    });
    assert(recalibRes.status === 200, 'FloorPlan recalibrated to 25.0 px/m (HTTP 200)');
    assert(recalibRes.data?.data?.pixelsPerMeter === 25, 'pixelsPerMeter updated to 25.0');

    // Fetch rooms to verify automatic area recalculation
    const updatedLivingRoom = await prisma.room.findUnique({ where: { id: livingRoom.id } });
    const updatedBedRoom = await prisma.room.findUnique({ where: { id: bedRoom.id } });

    assert(
      updatedLivingRoom?.areaSquareMeters === 80,
      `Living Room area automatically recalculated from 20.0 m² to 80.0 m² (actual: ${updatedLivingRoom?.areaSquareMeters} m²)`
    );
    assert(
      updatedBedRoom?.areaSquareMeters === 32,
      `Bed Room area automatically recalculated from 8.0 m² to 32.0 m² (actual: ${updatedBedRoom?.areaSquareMeters} m²)`
    );

    console.log('\n--- 7. Testing State-Gated Customer Privacy Barrier ---');

    // P10-08: Customer access restriction on CONFIGURING property
    const custGetPlan = await helper(`/api/floor-plans/${floorPlan.id}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert(custGetPlan.status === 403, 'Customer blocked from GET /api/floor-plans/:id on CONFIGURING house (HTTP 403)');

    const custPatchConfig = await helper(`/api/floor-plans/${floorPlan.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ name: 'Hacked Plan Name' }),
    });
    assert(custPatchConfig.status === 403, 'Customer blocked from PATCH /api/floor-plans/:id (HTTP 403)');

    const custCalibrate = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify(calibPayload),
    });
    assert(custCalibrate.status === 403, 'Customer blocked from POST /api/floor-plans/:id/calibration (HTTP 403)');

    const custPatchRoom = await helper(`/api/rooms/${livingRoom.id}/polygon`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ polygonCoordinates: livingRoomPolygon }),
    });
    assert(custPatchRoom.status === 403, 'Customer blocked from PATCH /api/rooms/:id/polygon (HTTP 403)');

    console.log('\n--- 8. Testing Multi-Tenant Technician IDOR Isolation ---');

    // P10-09: Unassigned technician B blocked
    const techBGetPlan = await helper(`/api/floor-plans/${floorPlan.id}`, {
      headers: { Authorization: `Bearer ${techBToken}` },
    });
    assert(techBGetPlan.status === 403, 'Unassigned Technician B blocked from GET /api/floor-plans/:id (HTTP 403)');

    const techBPatchConfig = await helper(`/api/floor-plans/${floorPlan.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techBToken}` },
      body: JSON.stringify({ name: 'Tech B Plan' }),
    });
    assert(techBPatchConfig.status === 403, 'Unassigned Technician B blocked from modifying floor plan config (HTTP 403)');

    const techBCalibrate = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techBToken}` },
      body: JSON.stringify(calibPayload),
    });
    assert(techBCalibrate.status === 403, 'Unassigned Technician B blocked from saving calibration (HTTP 403)');

    const techBPatchPolygon = await helper(`/api/rooms/${livingRoom.id}/polygon`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techBToken}` },
      body: JSON.stringify({ polygonCoordinates: livingRoomPolygon }),
    });
    assert(techBPatchPolygon.status === 403, 'Unassigned Technician B blocked from modifying room polygon (HTTP 403)');

    console.log('\n--- 9. Testing Immediate Access Revocation upon Assignment Revocation ---');

    // P10-10: Immediate revocation
    // Super Admin revokes Technician A's assignment
    await prisma.serviceOrderAssignment.updateMany({
      where: {
        serviceOrderId: order.id,
        technicianProfileId: technicianAUser.technicianProfile!.id,
      },
      data: {
        status: AssignmentStatus.REVOKED,
        revokedAt: new Date(),
        revokedByAdminId: adminLogin.data.data.user.id,
        reassignmentReason: 'Phase 10 immediate revocation test',
      },
    });

    // Verify DB policy reflects revocation immediately
    const isTechAStillAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
      technicianAUser.technicianProfile!.id,
      house.id
    );
    assert(isTechAStillAssigned === false, 'PropertyAccessPolicy immediately returns false after assignment revocation');

    // Technician A attempts to calibrate or modify room polygon
    const revokedCalibRes = await helper(`/api/floor-plans/${floorPlan.id}/calibration`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify(calibPayload),
    });
    assert(revokedCalibRes.status === 403, 'Revoked Technician A immediately denied calibration access (HTTP 403 Forbidden)');

    const revokedPolyRes = await helper(`/api/rooms/${livingRoom.id}/polygon`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({ polygonCoordinates: livingRoomPolygon }),
    });
    assert(revokedPolyRes.status === 403, 'Revoked Technician A immediately denied room polygon access (HTTP 403 Forbidden)');

  } catch (err: any) {
    console.error('Fatal error during Phase 10 test execution:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning Up Phase 10 Test Fixtures ---');

    // Clean up orders & assignments
    for (const orderId of createdOrderIds) {
      try {
        await prisma.serviceOrderAssignment.deleteMany({ where: { serviceOrderId: orderId } });
        await prisma.serviceOrder.deleteMany({ where: { id: orderId } });
      } catch { }
    }

    // Clean up house, floors, plans, rooms
    for (const houseId of createdHouseIds) {
      try {
        const h = await prisma.house.findUnique({
          where: { id: houseId },
          include: {
            floors: {
              include: {
                floorPlan: true,
                rooms: true,
              },
            },
          },
        });
        if (h) {
          for (const f of h.floors) {
            if (f.floorPlan) {
              await prisma.floorPlanObject.deleteMany({ where: { floorPlanId: f.floorPlan.id } });
              await prisma.floorPlan.deleteMany({ where: { id: f.floorPlan.id } });
            }
            await prisma.room.deleteMany({ where: { floorId: f.id } });
          }
          await prisma.floor.deleteMany({ where: { houseId } });
          await prisma.house.delete({ where: { id: houseId } });
        }

        // Clean up uploads/floor-plans/{houseId}
        const houseUploadDir = path.resolve(FLOOR_PLANS_DIR, houseId);
        if (fs.existsSync(houseUploadDir)) {
          fs.rmSync(houseUploadDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.warn(`Failed to clean up house ${houseId}:`, e);
      }
    }

    // Clean up users
    for (const userId of createdUserIds) {
      try {
        await prisma.customerProfile.deleteMany({ where: { userId } });
        await prisma.technicianProfile.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      } catch { }
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();

    console.log('\n===================================================================');
    console.log(`Phase 10 Test Execution Summary: ${passed} Passed, ${failed} Failed`);
    console.log('===================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPhase10IntegrationTest().catch((err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});
