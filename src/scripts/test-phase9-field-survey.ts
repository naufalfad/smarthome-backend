/**
 * PHASE 9 INTEGRATION TEST SUITE: FIELD SURVEY EXECUTION & CANONICAL PROPERTY CREATION
 *
 * Verifies:
 * - P9-01: Field Survey Draft Initialization & Retrieval
 * - P9-02: Technician Workspace IDOR Isolation & Unauthorized Access Prevention
 * - P9-03: Multi-Room Inventory Draft Save & Package Quota Alignment
 * - P9-04: Survey Visit Scheduling
 * - P9-05: Order-Scoped Internal Photo Upload, Path Containment & Storage Binding
 * - P9-06: Strict Multi-Tenant Customer Privacy Barrier (HTTP 403 Forbidden on survey & photos)
 * - P9-07: Mandatory Preconditions Enforcement on Submit (Min 1 room, MCB amps, voltage, min 1 photo)
 * - P9-08: Super Admin Survey Inspection & Workload Review
 * - P9-09: Super Admin Revision Request Workflow & Resubmission
 * - P9-10: Idempotent Canonical House Creation & Floor/Room Generation (CONFIGURING setupStatus)
 * - P9-11: Post-Verification Immutability (DRAFT edits blocked after VERIFIED)
 * - P9-12: Immediate Technician Revocation upon Reassignment
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { Prisma, AssignmentStatus, FieldSurveyStatus } from '@prisma/client';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { PropertyAccessPolicy } = await import('../services/property-access-policy.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');
const { getOrderSurveyDirectory, resolveOrderSurveyPhotoPath } = await import('../utils/storage-path.util.js');

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

async function runPhase9IntegrationTest() {
  console.log('===================================================================');
  console.log('⚡ PHASE 9: FIELD SURVEY EXECUTION & CANONICAL PROPERTY CREATION');
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
      } catch {}
    } else {
      try {
        data = await res.text();
      } catch {}
    }

    return { status: res.status, data, headers: res.headers };
  };

  // Fixtures cleanup tracking
  const createdUserIds: string[] = [];
  const createdHouseIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPackageIds: string[] = [];
  const filesToCleanup: string[] = [];

  try {
    console.log('--- 0. Preparing Phase 9 Test Fixtures ---');

    // 1. Admin login
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin login succeeds');
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // 2. Create Service Package
    const pkg = await prisma.servicePackage.create({
      data: {
        code: `PKG-P9-${uniqueTag}`,
        name: `Phase 9 Commercial Suite ${uniqueTag}`,
        shortDescription: 'Turnkey Smart Home with on-site field survey',
        description: 'Paket komersial lengkap dengan survei lapangan teknisi dan inisialisasi properti.',
        price: new Prisma.Decimal('18500000.00'),
        currency: 'IDR',
        status: 'ACTIVE',
        maxRooms: 4,
        maxDevices: 12,
        hasPhysicalIot: true,
        hasThreeD: true,
      },
    });
    createdPackageIds.push(pkg.id);

    // 3. Create Customer
    const custUser = await prisma.user.create({
      data: {
        email: `p9cust_${uniqueTag}@example.com`,
        username: `p9cust_${uniqueTag}`,
        name: `P9 Customer ${uniqueTag}`,
        password: hashPassword('CustPass123!'),
        role: 'CUSTOMER',
        isActive: true,
        customerProfile: {
          create: {
            fullName: `P9 Customer ${uniqueTag}`,
            phone: '081299990001',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(custUser.id);

    const custLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: custUser.email, password: 'CustPass123!' }),
    });
    const custToken = custLogin.data?.data?.token;
    assert(custLogin.status === 200 && !!custToken, 'Customer user login succeeds');
    const custHeaders = { Authorization: `Bearer ${custToken}` };

    // 4. Create Technician A (Primary)
    const techAUser = await prisma.user.create({
      data: {
        email: `p9techa_${uniqueTag}@example.com`,
        username: `p9techa_${uniqueTag}`,
        name: `Teknisi Prima ${uniqueTag}`,
        password: hashPassword('TechPass123!'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-A-${uniqueTag.toUpperCase()}`,
            specialization: 'IoT & Electrical Systems',
            availabilityStatus: 'AVAILABLE',
            serviceArea: 'Jakarta Barat',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techAUser.id);

    const techALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p9techa_${uniqueTag}`, password: 'TechPass123!' }),
    });
    const techAToken = techALogin.data?.data?.token;
    assert(techALogin.status === 200 && !!techAToken, 'Technician A login succeeds');
    const techAHeaders = { Authorization: `Bearer ${techAToken}` };

    // 5. Create Technician B (Secondary / Replacement)
    const techBUser = await prisma.user.create({
      data: {
        email: `p9techb_${uniqueTag}@example.com`,
        username: `p9techb_${uniqueTag}`,
        name: `Teknisi Pengganti ${uniqueTag}`,
        password: hashPassword('TechPass123!'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-B-${uniqueTag.toUpperCase()}`,
            specialization: 'Network & Smart Home',
            availabilityStatus: 'AVAILABLE',
            serviceArea: 'Jakarta Barat',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techBUser.id);

    const techBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p9techb_${uniqueTag}`, password: 'TechPass123!' }),
    });
    const techBToken = techBLogin.data?.data?.token;
    assert(techBLogin.status === 200 && !!techBToken, 'Technician B login succeeds');
    const techBHeaders = { Authorization: `Bearer ${techBToken}` };

    // 6. Submit Customer ServiceOrder
    const orderRes = await helper('/api/service-orders', {
      method: 'POST',
      headers: custHeaders,
      body: JSON.stringify({
        packageId: pkg.id,
        propertyName: `P9 Modern Residence ${uniqueTag}`,
        propertyAddress: 'Jl. Merdeka Barat No. 99',
        propertyType: 'HOUSE',
        city: 'Jakarta',
        postalCode: '11480',
        approximateAreaM2: 180,
        estimatedRooms: 3,
        contactName: 'PIC Rumah',
        contactPhone: '081233445566',
      }),
    });
    assert(orderRes.status === 201, 'Customer submits ServiceOrder successfully');
    const orderId = orderRes.data?.data?.id;
    createdOrderIds.push(orderId);

    // 7. Super Admin Confirms Order
    const confirmRes = await helper(`/api/service-orders/admin/${orderId}/confirm`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ adminNotes: 'Pesanan P9 dikonfirmasi untuk survei' }),
    });
    assert(confirmRes.status === 200, 'Super Admin confirms order');

    // 8. Super Admin Assigns Technician A
    const assignRes = await helper(`/api/service-orders/admin/${orderId}/assign`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        technicianProfileId: techAUser.technicianProfile!.id,
        technicianInstructions: 'Lakukan audit menyeluruh kapasitas panel MCB dan sinyal Wi-Fi',
      }),
    });
    assert(assignRes.status === 201, 'Super Admin assigns Technician A to confirmed order');
    const assignmentId = assignRes.data?.data?.id;

    console.log('\n--- 1. P9-01: Survey Draft Initialization ---');
    const initRes = await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'GET',
      headers: techAHeaders,
    });
    assert(initRes.status === 200, 'Technician A loads or initializes field survey draft');
    assert(initRes.data?.data?.status === 'DRAFT', 'Survey status is initialized as DRAFT');
    assert(initRes.data?.data?.serviceOrderId === orderId, 'Survey correctly references ServiceOrder');
    assert(initRes.data?.data?.packageSnapshot?.maxRooms === 4, 'Package snapshot limit maxRooms is preserved');

    console.log('\n--- 2. P9-02: Technician Workspace IDOR Isolation ---');
    // Technician B attempts to load Technician A's survey draft
    const techBIntrusion = await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'GET',
      headers: techBHeaders,
    });
    assert(
      techBIntrusion.status === 404 || techBIntrusion.status === 403,
      'Unassigned Technician B blocked from accessing assignment survey (IDOR prevention)'
    );

    console.log('\n--- 3. P9-03: Multi-Room Inventory Draft Save ---');
    const draftPayload = {
      buildingType: 'Rumah Tinggal',
      totalFloors: 2,
      estimatedAreaM2: 175.5,
      wallStructureMaterial: 'Hebel / Bata Ringan',
      ceilingHeightMeters: 3.2,
      mainBreakerAmps: 25,
      mainsVoltageVolts: 221.4,
      groundingStatus: 'Baik',
      hasSubPanels: true,
      subPanelLocations: 'Lantai 2 Lorong',
      electricalNotes: 'Kabel fase dan netral lengkap',
      ispProvider: 'Biznet Home',
      connectionType: 'Fiber Optik',
      measuredDownloadSpeed: 75.5,
      measuredUploadSpeed: 75.0,
      mainRouterLocation: 'Ruang Tamu Lantai 1',
      wifiCoverageRating: 'Sangat Baik',
      networkNotes: 'Router Wi-Fi 6 siap pasang bridge',
      rooms: [
        {
          roomName: 'Ruang Tamu & Foyer',
          roomType: 'LIVING_ROOM',
          floorLevel: 1,
          lengthMeters: 5.0,
          widthMeters: 4.0,
          heightMeters: 3.2,
          wallOutletsCount: 4,
          lightSwitchesCount: 2,
          existingAcUnits: 1,
          acUnitModel: 'Daikin 1.5 PK Inverter',
        },
        {
          roomName: 'Kamar Tidur Utama',
          roomType: 'BEDROOM',
          floorLevel: 2,
          lengthMeters: 4.5,
          widthMeters: 4.0,
          heightMeters: 3.0,
          wallOutletsCount: 4,
          lightSwitchesCount: 2,
          existingAcUnits: 1,
          acUnitModel: 'Panasonic 1 PK',
        },
        {
          roomName: 'Dapur & Ruang Makan',
          roomType: 'KITCHEN',
          floorLevel: 1,
          lengthMeters: 4.0,
          widthMeters: 3.5,
          heightMeters: 3.2,
          wallOutletsCount: 6,
          lightSwitchesCount: 2,
          existingAcUnits: 0,
        },
      ],
    };

    const saveDraftRes = await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'PUT',
      headers: techAHeaders,
      body: JSON.stringify(draftPayload),
    });
    assert(saveDraftRes.status === 200, 'Technician A saves survey draft with 3 rooms');
    assert(saveDraftRes.data?.data?.rooms?.length === 3, 'Rooms inventory saved with 3 items');
    assert(saveDraftRes.data?.data?.totalFloors === 2, 'Total floors updated to 2');

    console.log('\n--- 4. P9-04: Survey Visit Scheduling ---');
    const scheduleDate = new Date(Date.now() + 86400000).toISOString();
    const scheduleRes = await helper(`/api/technician/assignments/${assignmentId}/survey/schedule`, {
      method: 'PATCH',
      headers: techAHeaders,
      body: JSON.stringify({ scheduledDate: scheduleDate }),
    });
    assert(scheduleRes.status === 200, 'Technician schedules on-site survey visit date');

    const invalidDateRes = await helper(`/api/technician/assignments/${assignmentId}/survey/schedule`, {
      method: 'PATCH',
      headers: techAHeaders,
      body: JSON.stringify({ scheduledDate: 'invalid-date-format' }),
    });
    assert(invalidDateRes.status === 400, 'Invalid date format rejected with HTTP 400');

    console.log('\n--- 5. P9-05: Order-Scoped Photo Upload & Containment ---');
    // Prepare fake image multipart payload using FormData
    const fakeImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    const formData = new FormData();
    const blob = new Blob([fakeImageBuffer], { type: 'image/png' });
    formData.append('photo', blob, 'mcb_panel_test.png');
    formData.append('category', 'MAIN_PANEL');
    formData.append('title', 'Panel MCB Utama Lantai 1');
    formData.append('caption', 'Kondisi rapi, MCB 25A');

    const photoRes = await helper(`/api/technician/assignments/${assignmentId}/survey/photos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: formData,
    });
    assert(photoRes.status === 201, 'Survey photo uploaded successfully');
    const photoId = photoRes.data?.data?.id;
    const photoFileName = photoRes.data?.data?.fileName;
    assert(!!photoId && !!photoFileName, 'Photo record created with unique filename');

    // Verify order-scoped storage path containment
    const orderSurveyDir = getOrderSurveyDirectory(orderId);
    const resolvedPath = resolveOrderSurveyPhotoPath(orderId, photoFileName);
    assert(!!resolvedPath, 'Order-scoped survey photo resolves cleanly without traversal');
    assert(
      fs.existsSync(resolvedPath!.absolutePath),
      'Survey photo physically exists in backend/uploads/surveys/orders/{orderId}/'
    );
    filesToCleanup.push(resolvedPath!.absolutePath);

    console.log('\n--- 6. P9-06: Strict Customer Privacy Barrier ---');
    // Customer attempts to get internal survey details
    const custSurveyAccess = await helper(`/api/service-orders/admin/${orderId}/survey`, {
      method: 'GET',
      headers: custHeaders,
    });
    assert(
      custSurveyAccess.status === 403,
      'Customer blocked with HTTP 403 Forbidden from viewing internal survey details'
    );

    // Customer attempts to stream raw survey photo
    const custPhotoAccess = await helper(`/api/surveys/photos/${photoId}`, {
      method: 'GET',
      headers: custHeaders,
    });
    assert(
      custPhotoAccess.status === 403,
      'Customer blocked with HTTP 403 Forbidden from streaming internal survey photo'
    );

    // Super Admin authorized to stream survey photo
    const adminPhotoStream = await helper(`/api/surveys/photos/${photoId}`, {
      method: 'GET',
      headers: adminHeaders,
    });
    assert(adminPhotoStream.status === 200, 'Super Admin successfully streams survey photo');

    // Assigned Technician A authorized to stream survey photo
    const techAPhotoStream = await helper(`/api/surveys/photos/${photoId}`, {
      method: 'GET',
      headers: techAHeaders,
    });
    assert(techAPhotoStream.status === 200, 'Assigned Technician A successfully streams survey photo');

    console.log('\n--- 7. P9-07: Mandatory Preconditions Enforcement on Submit ---');
    // Temporarily clear electrical info to test validation
    await prisma.fieldSurvey.update({
      where: { serviceOrderId: orderId },
      data: { mainBreakerAmps: null },
    });

    const submitMissingElec = await helper(`/api/technician/assignments/${assignmentId}/survey/submit`, {
      method: 'POST',
      headers: techAHeaders,
    });
    assert(
      submitMissingElec.status === 400,
      'Submit rejected when mandatory electrical info (MCB amps) is missing'
    );

    // Restore electrical info and submit
    await prisma.fieldSurvey.update({
      where: { serviceOrderId: orderId },
      data: { mainBreakerAmps: 25 },
    });

    const validSubmit = await helper(`/api/technician/assignments/${assignmentId}/survey/submit`, {
      method: 'POST',
      headers: techAHeaders,
    });
    assert(validSubmit.status === 200, 'Survey submitted successfully when all preconditions met');
    assert(validSubmit.data?.data?.status === 'SUBMITTED', 'Survey status transitioned to SUBMITTED');

    console.log('\n--- 8. P9-08: Super Admin Survey Review ---');
    const adminSurveyRes = await helper(`/api/service-orders/admin/${orderId}/survey`, {
      method: 'GET',
      headers: adminHeaders,
    });
    assert(adminSurveyRes.status === 200, 'Super Admin retrieves complete submitted survey');
    assert(adminSurveyRes.data?.data?.rooms?.length === 3, 'Rooms inventory correctly returned to Admin');
    assert(adminSurveyRes.data?.data?.photos?.length === 1, 'Photos array correctly returned to Admin');
    assert(adminSurveyRes.data?.data?.history?.length >= 2, 'Field survey status history trail recorded');

    console.log('\n--- 9. P9-09: Super Admin Revision Request Workflow ---');
    // Short revision reason rejected (< 5 chars)
    const invalidRevision = await helper(`/api/service-orders/admin/${orderId}/survey/request-revision`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ revisionReason: 'bad' }),
    });
    assert(invalidRevision.status === 400, 'Revision reason < 5 chars rejected with HTTP 400');

    // Valid revision request
    const validRevision = await helper(`/api/service-orders/admin/${orderId}/survey/request-revision`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        revisionReason: 'Foto panel MCB kurang jelas; mohon periksa grounding sekunder.',
      }),
    });
    assert(validRevision.status === 200, 'Super Admin requests revision successfully');
    assert(validRevision.data?.data?.status === 'REVISION_REQUIRED', 'Survey status is REVISION_REQUIRED');

    // Technician resubmits survey
    const resubmitRes = await helper(`/api/technician/assignments/${assignmentId}/survey/submit`, {
      method: 'POST',
      headers: techAHeaders,
    });
    assert(resubmitRes.status === 200, 'Technician resubmits corrected survey to SUBMITTED');

    console.log('\n--- 10. P9-10: Idempotent Canonical House Creation & SetupStatus ---');
    const verifyRes1 = await helper(`/api/service-orders/admin/${orderId}/survey/verify`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ adminNotes: 'Survei valid dan disetujui.' }),
    });
    assert(
      verifyRes1.status === 201 || verifyRes1.status === 200,
      'Super Admin verifikasi survei dan berhasil menciptakan House'
    );
    const house = verifyRes1.data?.data?.house;
    assert(!!house && !!house.id, 'Canonical House entity successfully created');
    createdHouseIds.push(house.id);

    // Verify property setup status
    assert(
      house.setupStatus === 'CONFIGURING',
      'Canonical House setupStatus initialized as CONFIGURING (never ACTIVE prior to Phase 11)'
    );

    // Verify floors and rooms
    const createdHouseRecord = await prisma.house.findUnique({
      where: { id: house.id },
      include: {
        floors: {
          include: {
            rooms: true,
            floorPlan: true,
          },
        },
      },
    });

    assert(createdHouseRecord?.floors.length === 2, 'House initialized with exactly 2 Floor entities');
    const totalRoomsCreated = createdHouseRecord?.floors.reduce(
      (acc, f) => acc + f.rooms.length,
      0
    );
    assert(totalRoomsCreated === 3, 'House initialized with exactly 3 Room entities matching survey');
    assert(
      Boolean(createdHouseRecord?.floors.every((f) => !!f.floorPlan)),
      'Each floor is initialized with default FloorPlan canvas'
    );

    // Verify ServiceOrder houseId binding
    const updatedOrder = await prisma.serviceOrder.findUnique({
      where: { id: orderId },
    });
    assert(updatedOrder?.houseId === house.id, 'service_orders.houseId populated with newly created House');

    // Idempotency check: repeat verification call
    const verifyRes2 = await helper(`/api/service-orders/admin/${orderId}/survey/verify`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ adminNotes: 'Panggilan verifikasi kedua (idempoten).' }),
    });
    assert(verifyRes2.status === 200, 'Idempotent verification returns HTTP 200');
    assert(
      verifyRes2.data?.data?.house?.id === house.id,
      'Idempotent verification returns existing House without duplicate'
    );

    const houseCount = await prisma.house.count({
      where: { name: `P9 Modern Residence ${uniqueTag}` },
    });
    assert(houseCount === 1, 'Zero duplicate House entities created across repeated verification calls');

    console.log('\n--- 11. P9-11: Post-Verification Immutability ---');
    const editAfterVerify = await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'PUT',
      headers: techAHeaders,
      body: JSON.stringify({ buildingType: 'Perubahan Terlarang' }),
    });
    assert(
      editAfterVerify.status === 409,
      'DRAFT edits rejected with HTTP 409 Conflict after survey is VERIFIED'
    );

    console.log('\n--- 12. P9-12: Immediate Technician Revocation upon Reassignment ---');
    // Reassign order to Technician B
    const reassignRes = await helper(`/api/service-orders/admin/${orderId}/reassign`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        technicianProfileId: techBUser.technicianProfile!.id,
        reason: 'Teknisi A dipindahtugaskan ke proyek darurat lain',
      }),
    });
    assert(reassignRes.status === 200, 'Order successfully reassigned to Technician B');

    // Revoked Technician A attempts to stream survey photo
    const revokedPhotoAccess = await helper(`/api/surveys/photos/${photoId}`, {
      method: 'GET',
      headers: techAHeaders,
    });
    assert(
      revokedPhotoAccess.status === 403,
      'Revoked Technician A immediately blocked from streaming survey photos (HTTP 403)'
    );

    // Replacement Technician B granted photo access
    const techBPhotoAccess = await helper(`/api/surveys/photos/${photoId}`, {
      method: 'GET',
      headers: techBHeaders,
    });
    assert(
      techBPhotoAccess.status === 200,
      'Replacement Technician B successfully granted access to survey photos'
    );

  } catch (err: any) {
    console.error('Fatal error during Phase 9 test execution:', err);
    failed++;
  } finally {
    console.log('\n--- Teardown: Cleaning Test Fixtures ---');
    server.close();

    // Clean up temporary photo files on disk
    for (const f of filesToCleanup) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }

    try {
      for (const orderId of createdOrderIds) {
        // Clean survey directory
        const dir = getOrderSurveyDirectory(orderId);
        if (fs.existsSync(dir)) {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch {}
        }

        // Clean database records
        await prisma.fieldSurveyHistory.deleteMany({
          where: { survey: { serviceOrderId: orderId } },
        });
        await prisma.surveyPhoto.deleteMany({
          where: { survey: { serviceOrderId: orderId } },
        });
        await prisma.surveyRoomItem.deleteMany({
          where: { survey: { serviceOrderId: orderId } },
        });
        await prisma.fieldSurvey.deleteMany({
          where: { serviceOrderId: orderId },
        });
        await prisma.serviceOrderAssignment.deleteMany({
          where: { serviceOrderId: orderId },
        });
        await prisma.serviceOrderStatusHistory.deleteMany({
          where: { serviceOrderId: orderId },
        });
        await prisma.serviceOrder.deleteMany({
          where: { id: orderId },
        });
      }

      for (const houseId of createdHouseIds) {
        await prisma.house.deleteMany({
          where: { id: houseId },
        });
      }

      for (const uid of createdUserIds) {
        await prisma.technicianProfile.deleteMany({ where: { userId: uid } });
        await prisma.customerProfile.deleteMany({ where: { userId: uid } });
        await prisma.user.deleteMany({ where: { id: uid } });
      }

      for (const pkgId of createdPackageIds) {
        await prisma.servicePackage.deleteMany({ where: { id: pkgId } });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }

    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 9 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9IntegrationTest();
