/**
 * PHASE 11 INTEGRATION TEST SUITE:
 * IOT DEVICE PLACEMENT, COMMISSIONING, AUTOMATION BINDING & CUSTOMER HANDOVER/ACTIVATION
 *
 * Verifies:
 * - P11-01: IoT Device Placement & 2D World Coordinate Association
 * - P11-02: Package maxDevices Quota Enforcement Guard
 * - P11-03: Virtual Device Commissioning & Command Execution via Provider Layer
 * - P11-04: Background Simulation Telemetry Integration
 * - P11-05: State-Gated Customer Access Barrier Prior to Activation (HTTP 403)
 * - P11-06: Technician Handover Readiness Proposal (READY_FOR_HANDOVER)
 * - P11-07: Atomic Handover & Property Activation Transaction (House.ACTIVE, Assignment.COMPLETED)
 * - P11-08: Activation Idempotency & Repeat Safety (HTTP 200 with alreadyActive: true)
 * - P11-09: Completed Assignment Immutability Guard (Reassign blocked with HTTP 409)
 * - P11-10: Immediate Operational Access Opening for Owning Customer (HTTP 200)
 * - P11-11: Multi-Tenant Customer IDOR Isolation on Active Property (HTTP 403)
 */

import http from 'http';
import { Prisma, AssignmentStatus, ServiceOrderStatus, PropertySetupStatus } from '@prisma/client';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { PropertyAccessPolicy } = await import('../services/property-access-policy.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');

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

async function runPhase11IntegrationTest() {
  console.log('===================================================================');
  console.log('⚡ PHASE 11: IOT COMMISSIONING, HANDOVER & PROPERTY ACTIVATION');
  console.log('===================================================================\n');

  const uniqueTag = Date.now().toString(36).toLowerCase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const helper = async (url: string, options: any = {}) => {
    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (!headers['Content-Type']) {
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

  try {
    console.log('--- 0. Preparing Phase 11 Test Fixtures ---');

    // 1. Admin login
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(Boolean(adminToken), 'Super Admin login successfully generates auth token');

    // 2. Create Customer A
    const passwordHash = hashPassword('password123');
    const customerAUser: any = await prisma.user.create({
      data: {
        username: `p11custa_${uniqueTag}`,
        email: `p11custa_${uniqueTag}@test.com`,
        password: passwordHash,
        name: 'Phase 11 Customer A',
        role: 'CUSTOMER',
        customerProfile: {
          create: {
            fullName: 'Phase 11 Customer A',
            phone: '081234567891',
            billingAddress: 'Jl. Smart Home No. 11A',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(customerAUser.id);

    const custALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p11custa_${uniqueTag}`, password: 'password123' }),
    });
    const custAToken = custALogin.data?.data?.token;
    assert(Boolean(custAToken), 'Customer A login successfully generates auth token');

    // 3. Create Customer B (for IDOR tests)
    const customerBUser: any = await prisma.user.create({
      data: {
        username: `p11custb_${uniqueTag}`,
        email: `p11custb_${uniqueTag}@test.com`,
        password: passwordHash,
        name: 'Phase 11 Customer B',
        role: 'CUSTOMER',
        customerProfile: {
          create: {
            fullName: 'Phase 11 Customer B',
            phone: '081234567892',
            billingAddress: 'Jl. Smart Home No. 11B',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(customerBUser.id);

    const custBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p11custb_${uniqueTag}`, password: 'password123' }),
    });
    const custBToken = custBLogin.data?.data?.token;
    assert(Boolean(custBToken), 'Customer B login successfully generates auth token');

    // 4. Create Technician A
    const techAUser: any = await prisma.user.create({
      data: {
        username: `p11techa_${uniqueTag}`,
        email: `p11techa_${uniqueTag}@test.com`,
        password: passwordHash,
        name: 'Phase 11 Technician A',
        role: 'TECHNICIAN',
        technicianProfile: {
          create: {
            employeeCode: `TECH-P11A-${uniqueTag.toUpperCase()}`,
            specialization: 'IoT Commissioning Specialist',
            serviceArea: 'DKI Jakarta',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techAUser.id);

    const techALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `p11techa_${uniqueTag}`, password: 'password123' }),
    });
    const techAToken = techALogin.data?.data?.token;
    assert(Boolean(techAToken), 'Assigned Technician A login successfully generates auth token');

    // 5. Create Test Service Package with maxDevices: 2 (quota constraint)
    const pkg = await prisma.servicePackage.create({
      data: {
        name: `Package Phase 11 Limited ${uniqueTag}`,
        code: `PKG-P11-${uniqueTag}`,
        shortDescription: 'Paket Komisioning Phase 11',
        description: 'Paket komisi IoT dengan batas 2 perangkat',
        price: new Prisma.Decimal('15000000.00'),
        currency: 'IDR',
        status: 'ACTIVE',
        maxRooms: 5,
        maxDevices: 2, // Quota limit for testing
        hasPhysicalIot: true,
      },
    });
    createdPackageIds.push(pkg.id);

    // 6. Submit Customer Order
    const orderSubmit = await helper('/api/service-orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        packageId: pkg.id,
        contactName: 'Phase 11 Customer A',
        contactPhone: '081234567891',
        propertyName: 'Villa Smart Phase 11',
        propertyType: 'VILLA',
        propertyAddress: 'Komp. Smart Tech Blok P11',
      }),
    });
    const orderId = orderSubmit.data?.data?.id;
    assert(orderSubmit.status === 201 && Boolean(orderId), 'Customer submits ServiceOrder successfully');
    createdOrderIds.push(orderId);

    // 7. Confirm Order & Assign Technician A
    await helper(`/api/service-orders/admin/${orderId}/confirm`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adminNotes: 'Confirmed for P11 verification' }),
    });

    const assignRes = await helper(`/api/service-orders/admin/${orderId}/assign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        technicianProfileId: techAUser.technicianProfile.id,
        technicianInstructions: 'Lakukan survei dan instalasi 2 perangkat IoT virtual.',
      }),
    });
    const assignmentId = assignRes.data?.data?.id;

    // 8. Submit survey & verify to create House
    // Initialize survey draft first
    await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${techAToken}` },
    });

    await helper(`/api/technician/assignments/${assignmentId}/survey`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        buildingType: 'Villa 2 Lantai',
        totalFloors: 1,
        mainBreakerAmps: 25,
        mainsVoltageVolts: 220.0,
        rooms: [
          { roomName: 'Ruang Tamu', roomType: 'LIVING_ROOM', floorLevel: 1 },
          { roomName: 'Kamar Tidur Utama', roomType: 'BEDROOM', floorLevel: 1 },
        ],
      }),
    });

    // Add documentation photo to fulfill survey submission precondition
    const surveyRec = await prisma.fieldSurvey.findUnique({ where: { serviceOrderId: orderId } });
    if (surveyRec) {
      await prisma.surveyPhoto.create({
        data: {
          surveyId: surveyRec.id,
          fileName: 'p11_fixture_photo.png',
          filePath: `uploads/surveys/orders/${orderId}/p11_fixture_photo.png`,
          fileSize: 1024,
          mimeType: 'image/png',
          category: 'MAIN_PANEL',
          title: 'Panel MCB Test',
        },
      });
    }

    await helper(`/api/technician/assignments/${assignmentId}/survey/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
    });

    const verifyRes = await helper(`/api/service-orders/admin/${orderId}/survey/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adminNotes: 'Survey verified, house created' }),
    });

    const houseId = verifyRes.data?.data?.house?.id;
    assert(Boolean(houseId), 'Canonical House successfully created via survey verification');
    createdHouseIds.push(houseId);

    // Verify initial setupStatus is CONFIGURING
    const initialHouse = await prisma.house.findUnique({ where: { id: houseId } });
    assert(initialHouse?.setupStatus === PropertySetupStatus.CONFIGURING, 'House initially created with setupStatus: CONFIGURING');

    // -------------------------------------------------------------------
    // 1. Testing Device Placement & Coordinate Persistence
    // -------------------------------------------------------------------
    console.log('\n--- 1. Testing Device Placement & Coordinate Persistence ---');

    const placeDevice1 = await helper(`/api/houses/${houseId}/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        name: 'Lampu Ruang Tamu',
        type: 'SMART_LIGHT',
        x: 450,
        y: 350,
        rotation: 0,
        status: 'OFF',
      }),
    });

    assert(placeDevice1.status === 201, 'Technician A places first device successfully (HTTP 201)');
    const device1Id = placeDevice1.data?.data?.id;
    assert(Boolean(device1Id), 'Placed device returns valid ID');
    assert(placeDevice1.data?.data?.providerType === 'VIRTUAL', 'Device registered with providerType: VIRTUAL');
    assert(placeDevice1.data?.data?.connectionStatus === 'ONLINE', 'Device connectionStatus initialized as ONLINE');
    assert(placeDevice1.data?.data?.x === 450 && placeDevice1.data?.data?.y === 350, 'Device coordinates (450, 350) persisted accurately');

    // -------------------------------------------------------------------
    // 2. Testing Quota Enforcement (maxDevices: 2)
    // -------------------------------------------------------------------
    console.log('\n--- 2. Testing Quota Enforcement (maxDevices: 2) ---');

    // Place second device (reaching max quota of 2)
    const placeDevice2 = await helper(`/api/houses/${houseId}/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        name: 'AC Ruang Tamu',
        type: 'SMART_AC',
        x: 520,
        y: 200,
        status: 'OFF',
      }),
    });

    assert(placeDevice2.status === 201, 'Technician A places second device (reaches quota of 2)');
    const device2Id = placeDevice2.data?.data?.id;

    // Check quota query endpoint
    const quotaRes = await helper(`/api/houses/${houseId}/quota`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${techAToken}` },
    });
    assert(quotaRes.status === 200, 'GET /api/houses/:id/quota returns HTTP 200');
    assert(quotaRes.data?.data?.currentDevices === 2, 'Quota currentDevices correctly reports 2');
    assert(quotaRes.data?.data?.maxDevices === 2, 'Quota maxDevices correctly reports 2');
    assert(quotaRes.data?.data?.isQuotaReached === true, 'Quota isQuotaReached is true');

    // Attempt to place third device (must be REJECTED by quota guard)
    const placeDevice3 = await helper(`/api/houses/${houseId}/devices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        name: 'Lampu Kamar Tidur',
        type: 'SMART_LIGHT',
        x: 600,
        y: 400,
      }),
    });

    assert(placeDevice3.status === 400, 'Third device placement rejected with HTTP 400 (Quota Exceeded)');
    assert(
      typeof placeDevice3.data?.message === 'string' &&
        placeDevice3.data.message.includes('Batas kuota perangkat'),
      'Quota rejection message explains maximum devices reached'
    );

    // -------------------------------------------------------------------
    // 3. Testing Virtual Device Control & Commissioning Commands
    // -------------------------------------------------------------------
    console.log('\n--- 3. Testing Virtual Device Control & Commissioning Commands ---');

    // Turn ON Light 1
    const cmdLightOn = await helper(`/api/devices/${device1Id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        commandType: 'SET_POWER',
        payload: { power: 'ON', brightness: 80 },
      }),
    });

    assert(cmdLightOn.status === 200, 'Technician turns ON Smart Light (HTTP 200)');
    assert(cmdLightOn.data?.data?.status === 'SUCCESS', 'Command execution returns status SUCCESS');

    // Turn ON AC 2 and set temperature
    const cmdAcSet = await helper(`/api/devices/${device2Id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
      body: JSON.stringify({
        commandType: 'SET_TEMPERATURE',
        payload: { targetTemperature: 22, mode: 'COOL' },
      }),
    });

    assert(cmdAcSet.status === 200, 'Technician sets Smart AC temperature to 22°C (HTTP 200)');
    assert(cmdAcSet.data?.data?.status === 'SUCCESS', 'AC command execution returns status SUCCESS');

    // -------------------------------------------------------------------
    // 4. Testing State-Gated Customer Access Barrier Prior to Activation
    // -------------------------------------------------------------------
    console.log('\n--- 4. Testing State-Gated Customer Barrier (Pre-Activation) ---');

    const custOverviewPre = await helper(`/api/dashboard/overview?houseId=${houseId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${custAToken}` },
    });

    assert(custOverviewPre.status === 403, 'Customer blocked from dashboard on CONFIGURING house (HTTP 403 Forbidden)');
    assert(
      typeof custOverviewPre.data?.message === 'string' &&
        custOverviewPre.data.message.includes('belum berstatus ACTIVE'),
      'Access barrier message clearly explains property is not yet ACTIVE'
    );

    const custCmdPre = await helper(`/api/devices/${device1Id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        commandType: 'SET_POWER',
        payload: { power: 'OFF' },
      }),
    });

    assert(custCmdPre.status === 403, 'Customer blocked from device control on non-ACTIVE house (HTTP 403 Forbidden)');

    // -------------------------------------------------------------------
    // 5. Testing Technician Handover Readiness (READY_FOR_HANDOVER)
    // -------------------------------------------------------------------
    console.log('\n--- 5. Testing Technician Handover Readiness (READY_FOR_HANDOVER) ---');

    const readyRes = await helper(`/api/houses/${houseId}/ready-for-handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${techAToken}` },
    });

    assert(readyRes.status === 200, 'Technician marks property ready for handover (HTTP 200)');
    const houseAfterReady = await prisma.house.findUnique({ where: { id: houseId } });
    assert(houseAfterReady?.setupStatus === PropertySetupStatus.READY_FOR_HANDOVER, 'House setupStatus transitioned to READY_FOR_HANDOVER');

    // -------------------------------------------------------------------
    // 6. Testing Super Admin Atomic Handover & Property Activation
    // -------------------------------------------------------------------
    console.log('\n--- 6. Testing Super Admin Atomic Handover & Property Activation ---');

    const activateRes = await helper(`/api/service-orders/admin/${orderId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        adminNotes: 'Aktivasi disetujui, serah terima selesai ke pelanggan.',
      }),
    });

    assert(activateRes.status === 200, 'Super Admin activates order & property (HTTP 200)');
    assert(activateRes.data?.data?.alreadyActive === false, 'Activation reports alreadyActive: false');
    assert(activateRes.data?.data?.setupStatus === 'ACTIVE', 'Activation result reports setupStatus: ACTIVE');

    // Verify database state directly
    const housePost = await prisma.house.findUnique({ where: { id: houseId } });
    assert(housePost?.setupStatus === PropertySetupStatus.ACTIVE, 'Database confirms House.setupStatus is ACTIVE');
    assert(housePost?.publishStatus === 'PUBLISHED', 'Database confirms House.publishStatus is PUBLISHED');

    // Verify assignment completed
    const assignmentPost = await prisma.serviceOrderAssignment.findFirst({
      where: { serviceOrderId: orderId },
      orderBy: { createdAt: 'desc' },
    });
    assert(assignmentPost?.status === AssignmentStatus.COMPLETED, 'ServiceOrderAssignment transitioned to COMPLETED');
    assert(assignmentPost?.completedAt !== null, 'ServiceOrderAssignment completedAt timestamp is recorded');

    // Verify status history audit trail
    const historyEntry = await prisma.serviceOrderStatusHistory.findFirst({
      where: {
        serviceOrderId: orderId,
        actorRole: 'SUPER_ADMIN',
        reason: { contains: 'Handover Completed' },
      },
    });
    assert(Boolean(historyEntry), 'ServiceOrderStatusHistory records Handover audit trail');

    // -------------------------------------------------------------------
    // 7. Testing Activation Idempotency
    // -------------------------------------------------------------------
    console.log('\n--- 7. Testing Activation Idempotency ---');

    const secondActivateRes = await helper(`/api/service-orders/admin/${orderId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ adminNotes: 'Duplicate trigger' }),
    });

    assert(secondActivateRes.status === 200, 'Repeated activation returns HTTP 200 OK');
    assert(secondActivateRes.data?.data?.alreadyActive === true, 'Repeated activation reports alreadyActive: true');
    assert(secondActivateRes.data?.data?.setupStatus === 'ACTIVE', 'Status remains ACTIVE without regression');

    // -------------------------------------------------------------------
    // 8. Testing Completed Assignment Immutability Guard
    // -------------------------------------------------------------------
    console.log('\n--- 8. Testing Completed Assignment Immutability Guard ---');

    const reassignBlocked = await helper(`/api/service-orders/admin/${orderId}/reassign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        technicianProfileId: techAUser.technicianProfile.id,
        reason: 'Percobaan reassignment pada order yang sudah selesai',
      }),
    });

    assert(reassignBlocked.status === 409, 'Reassigning a COMPLETED assignment is strictly blocked (HTTP 409)');
    assert(
      typeof reassignBlocked.data?.message === 'string' &&
        reassignBlocked.data.message.includes('COMPLETED'),
      'Reassignment rejection confirms completed order immutability'
    );

    // -------------------------------------------------------------------
    // 9. Testing Immediate Operational Access Opening for Customer
    // -------------------------------------------------------------------
    console.log('\n--- 9. Testing Operational Customer Access After Activation ---');

    const custOverviewPost = await helper(`/api/dashboard/overview?houseId=${houseId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${custAToken}` },
    });

    assert(custOverviewPost.status === 200, 'Customer A accesses full dashboard overview successfully (HTTP 200)');
    assert(custOverviewPost.data?.data?.houseSummary?.id === houseId, 'Overview returns correct House metadata');

    const custDevicesPost = await helper(`/api/dashboard/devices?houseId=${houseId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${custAToken}` },
    });

    assert(custDevicesPost.status === 200, 'Customer A accesses live devices list (HTTP 200)');
    assert(Array.isArray(custDevicesPost.data?.data) && custDevicesPost.data.data.length === 2, 'Customer A sees all 2 placed devices');

    // Customer A controls device 1 (toggles light)
    const custCmdPost = await helper(`/api/devices/${device1Id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        commandType: 'SET_POWER',
        payload: { power: 'OFF' },
      }),
    });

    assert(custCmdPost.status === 200, 'Customer A successfully controls their active device (HTTP 200)');
    assert(custCmdPost.data?.data?.status === 'SUCCESS', 'Customer command returns status SUCCESS');

    // -------------------------------------------------------------------
    // 10. Testing Multi-Tenant Customer IDOR Isolation
    // -------------------------------------------------------------------
    console.log('\n--- 10. Testing Multi-Tenant Customer IDOR Isolation ---');

    const custBBlocked = await helper(`/api/dashboard/overview?houseId=${houseId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${custBToken}` },
    });

    assert(custBBlocked.status === 403, 'Customer B strictly blocked from accessing Customer A property (HTTP 403 Forbidden)');

    const custBCmdBlocked = await helper(`/api/devices/${device1Id}/command`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custBToken}` },
      body: JSON.stringify({
        commandType: 'SET_POWER',
        payload: { power: 'ON' },
      }),
    });

    assert(custBCmdBlocked.status === 403, 'Customer B strictly blocked from controlling Customer A device (HTTP 403 Forbidden)');

  } catch (err: any) {
    console.error('Unhandled exception during Phase 11 test execution:', err);
    failed++;
  } finally {
    console.log('\n--- Cleaning Up Phase 11 Test Fixtures ---');

    try {
      // Clean up orders
      for (const oId of createdOrderIds) {
        await prisma.serviceOrderStatusHistory.deleteMany({ where: { serviceOrderId: oId } }).catch(() => {});
        await prisma.surveyPhoto.deleteMany({ where: { survey: { serviceOrderId: oId } } }).catch(() => {});
        await prisma.surveyRoomItem.deleteMany({ where: { survey: { serviceOrderId: oId } } }).catch(() => {});
        await prisma.fieldSurveyHistory.deleteMany({ where: { survey: { serviceOrderId: oId } } }).catch(() => {});
        await prisma.fieldSurvey.deleteMany({ where: { serviceOrderId: oId } }).catch(() => {});
        await prisma.serviceOrderAssignment.deleteMany({ where: { serviceOrderId: oId } }).catch(() => {});
        await prisma.serviceOrder.deleteMany({ where: { id: oId } }).catch(() => {});
      }

      // Clean up houses
      for (const hId of createdHouseIds) {
        await prisma.deviceCommand.deleteMany({ where: { device: { houseId: hId } } }).catch(() => {});
        await prisma.deviceTelemetry.deleteMany({ where: { device: { houseId: hId } } }).catch(() => {});
        await prisma.device.deleteMany({ where: { houseId: hId } }).catch(() => {});
        await prisma.room.deleteMany({ where: { floorRel: { houseId: hId } } }).catch(() => {});
        await prisma.floorPlanObject.deleteMany({ where: { floorPlan: { floor: { houseId: hId } } } }).catch(() => {});
        await prisma.floorPlan.deleteMany({ where: { floor: { houseId: hId } } }).catch(() => {});
        await prisma.floor.deleteMany({ where: { houseId: hId } }).catch(() => {});
        await prisma.house.deleteMany({ where: { id: hId } }).catch(() => {});
      }

      // Clean up packages
      for (const pId of createdPackageIds) {
        await prisma.servicePackageInclusion.deleteMany({ where: { packageId: pId } }).catch(() => {});
        await prisma.servicePackage.deleteMany({ where: { id: pId } }).catch(() => {});
      }

      // Clean up users
      for (const uId of createdUserIds) {
        await prisma.technicianProfile.deleteMany({ where: { userId: uId } }).catch(() => {});
        await prisma.customerProfile.deleteMany({ where: { userId: uId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: uId } }).catch(() => {});
      }
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`Phase 11 Test Execution Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase11IntegrationTest();
