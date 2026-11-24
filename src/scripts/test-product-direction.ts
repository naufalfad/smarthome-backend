import { PrismaClient } from '@prisma/client';
import { DeviceService } from '../services/device.service.js';
import { PublishService } from '../services/publish.service.js';
import { ClientPortalService } from '../services/client-portal.service.js';
import { RoomService } from '../services/room.service.js';

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 SMART HOME PRODUCT DIRECTION ADJUSTMENT TEST SUITE');
  console.log('   Device Placement, Normalized Coords, Publish & Client Portal');
  console.log('====================================================\n');

  let testHouse: any = null;
  let testFloor: any = null;
  let testPlan: any = null;
  let testRoom: any = null;
  let deviceA: any = null;
  let deviceB: any = null;

  try {
    // Cleanup any lingering previous test runs
    await prisma.device.deleteMany({ where: { house: { name: 'Rumah Uji Produk' } } });
    await prisma.room.deleteMany({ where: { floorRel: { house: { name: 'Rumah Uji Produk' } } } });
    await prisma.floorPlan.deleteMany({ where: { floor: { house: { name: 'Rumah Uji Produk' } } } });
    await prisma.floor.deleteMany({ where: { house: { name: 'Rumah Uji Produk' } } });
    await prisma.house.deleteMany({ where: { name: 'Rumah Uji Produk' } });

    // ----------------------------------------------------
    // 1. SETUP: Create Test House, Floor, and Plan
    // ----------------------------------------------------
    console.log('🏠 Test Group 1: House Setup & Default Lifecycle Status');
    testHouse = await prisma.house.create({
      data: {
        name: 'Rumah Uji Produk',
        description: 'Testing product direction adjustments',
        clientName: 'Bapak Hendra',
        clientEmail: 'hendra@client.id',
        publishStatus: 'DRAFT',
      },
    });
    assert(testHouse.publishStatus === 'DRAFT', 'House initializes with DRAFT publish status');

    testFloor = await prisma.floor.create({
      data: {
        name: 'Lantai 1',
        levelNumber: 1,
        houseId: testHouse.id,
      },
    });

    testPlan = await prisma.floorPlan.create({
      data: {
        floorId: testFloor.id,
        name: 'Denah Lantai 1',
        viewBoxWidth: 1600,
        viewBoxHeight: 1000,
        imageWidth: 1600,
        imageHeight: 1000,
      },
    });
    assert(!!testPlan, 'Floor plan created with 1600x1000 base dimensions');

    // ----------------------------------------------------
    // 2. RELATIVE / NORMALIZED COORDINATES & OPTIONAL ROOM
    // ----------------------------------------------------
    console.log('\n🧭 Test Group 2: Device Placement & Normalized Coordinates');
    
    // Device A: Placed at absolute (800, 500) -> Normalized should be (0.5, 0.5)
    // No room polygon, pure manual location string
    deviceA = await DeviceService.createDevice(testPlan.id, {
      name: 'Lampu Teras Utama',
      type: 'LIGHT',
      x: 800,
      y: 500,
      manualRoomName: 'Teras Depan',
      integrationStatus: 'SIMULATED',
      status: 'ON',
    });

    assert(deviceA.x === 800 && deviceA.y === 500, 'Device A absolute coordinates match');
    assert(deviceA.normalizedX === 0.5 && deviceA.normalizedY === 0.5, 'Device A normalized coordinates correctly derived as (0.5, 0.5)');
    assert(deviceA.iconWidth === 48 && deviceA.iconHeight === 48, 'Device A initializes with default icon size 48x48');
    assert(deviceA.roomId === null, 'Device A has no roomId (Room polygon is completely optional)');
    assert(deviceA.manualRoomName === 'Teras Depan', 'Device A manual room name persisted without polygon');

    // Device B: Placed via normalized coords (0.25, 0.75) with custom icon size (64px) -> Absolute should derive as (400, 750)
    deviceB = await DeviceService.createDevice(testPlan.id, {
      name: 'Smart Door Lock Depan',
      type: 'LOCK',
      normalizedX: 0.25,
      normalizedY: 0.75,
      iconWidth: 64,
      iconHeight: 64,
      manualRoomName: 'Pintu Masuk',
      integrationStatus: 'SIMULATED',
      status: 'LOCKED',
    });

    assert(deviceB.x === 400 && deviceB.y === 750, 'Device B absolute coordinates accurately derived from normalized coordinates');
    assert(deviceB.normalizedX === 0.25 && deviceB.normalizedY === 0.75, 'Device B normalized coordinates stored accurately');
    assert(deviceB.iconWidth === 64 && deviceB.iconHeight === 64, 'Device B persists custom icon size 64x64');

    // Test device repositioning & resizing persistence (simulating drag-and-drop & corner handles)
    console.log('\n🖐️ Test Group 2B: Device Drag-and-Drop & Resize Persistence');
    const movedDeviceA = await DeviceService.updateDevice(deviceA.id, {
      x: 900,
      y: 600,
      normalizedX: 0.5625,
      normalizedY: 0.6,
    });
    assert(movedDeviceA.x === 900 && movedDeviceA.y === 600, 'Device A successfully repositioned to new coordinates (900, 600)');
    assert(movedDeviceA.normalizedX === 0.5625 && movedDeviceA.normalizedY === 0.6, 'Device A normalized coordinates updated accordingly');

    const resizedDeviceA = await DeviceService.updateDevice(deviceA.id, {
      iconWidth: 80,
      iconHeight: 80,
    });
    assert(resizedDeviceA.iconWidth === 80 && resizedDeviceA.iconHeight === 80, 'Device A successfully resized via handle/slider to 80x80');

    // ----------------------------------------------------
    // 3. OPTIONAL SPATIAL ROOM ENHANCEMENT
    // ----------------------------------------------------
    console.log('\n📐 Test Group 3: Optional Room Polygon Spatial Linking');
    // Create a polygon room covering (0,0) to (500, 400)
    testRoom = await RoomService.createRoom(testFloor.id, {
      name: 'Ruang Tamu Utama',
      type: 'LIVING_ROOM',
      color: '#3B82F6',
      polygonCoordinates: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 400 },
        { x: 0, y: 400 },
      ],
    });

    // Place Device C at (250, 200) -> inside testRoom
    const deviceC = await DeviceService.createDevice(testPlan.id, {
      name: 'Lampu Gantung Ruang Tamu',
      type: 'LIGHT',
      x: 250,
      y: 200,
    });

    assert(deviceC.roomId === testRoom.id, 'Device inside polygon automatically detects and assigns roomId');
    assert(deviceC.manualRoomName === 'Ruang Tamu Utama', 'Device inside polygon automatically inherits room name when unspecified');

    // Clean up device C
    await DeviceService.deleteDevice(deviceC.id);

    // ----------------------------------------------------
    // 4. PUBLISH VALIDATION WORKFLOW
    // ----------------------------------------------------
    console.log('\n🚀 Test Group 4: Dashboard Publishing & Validation Lifecycle');

    // Check status before background image is set
    let pubStatus = await PublishService.getPublishStatus(testHouse.id);
    assert(pubStatus.canPublish === false, 'Cannot publish when floor plan background image is missing');
    assert(pubStatus.checks.hasFloorPlanImage === false, 'Pre-publish correctly flags missing floor plan image');
    assert(pubStatus.checks.hasDevices === true, 'Pre-publish confirms devices exist (2 devices placed)');

    // Add background image reference to plan
    await prisma.floorPlan.update({
      where: { id: testPlan.id },
      data: { imagePath: 'uploads/test-floor-plan.png' },
    });

    // Recheck status
    pubStatus = await PublishService.getPublishStatus(testHouse.id);
    assert(pubStatus.canPublish === true, 'Can publish after background and valid devices are present');
    assert(pubStatus.validationErrors.length === 0, 'Zero validation errors remaining');

    // Transition: DRAFT -> PREVIEW
    const previewRes = await PublishService.previewHouse(testHouse.id);
    assert(previewRes.publishStatus === 'PREVIEW', 'House successfully transitioned to PREVIEW mode');

    // Transition: PREVIEW -> PUBLISHED
    const pubRes = await PublishService.publishHouse(testHouse.id);
    assert(pubRes.publishStatus === 'PUBLISHED', 'House successfully published to PUBLISHED status');
    assert(pubRes.publishedAt !== null, 'publishedAt timestamp recorded');

    // ----------------------------------------------------
    // 5. CLIENT PORTAL ACCESS & CONTROL INTERACTION
    // ----------------------------------------------------
    console.log('\n👥 Test Group 5: Client Portal Access & Simulated Control');

    // Published house is accessible by client
    const clientData = await ClientPortalService.getClientDashboard(testHouse.id);
    assert(clientData.isPublished === true, 'Client portal allows access to published dashboard');
    assert(clientData.house?.devices.length === 2, 'Client portal delivers all placed IoT devices');
    assert(clientData.house?.devices[0].normalizedX !== undefined, 'Client portal delivers normalized scale-invariant coordinates');
    assert(clientData.house?.devices[0].iconWidth !== undefined && clientData.house?.devices[0].iconHeight !== undefined, 'Client portal delivers device icon dimensions (iconWidth & iconHeight)');

    // Simulated control on deviceA (Toggle Power)
    const toggledA = await ClientPortalService.controlDevice(testHouse.id, deviceA.id, {
      action: 'TOGGLE_POWER',
    });
    assert(toggledA.status === 'OFF', 'Client toggled Lampu Teras Utama from ON to OFF');

    // Simulated control on deviceB (Toggle Lock)
    const toggledB = await ClientPortalService.controlDevice(testHouse.id, deviceB.id, {
      action: 'TOGGLE_LOCK',
    });
    assert(toggledB.status === 'UNLOCKED', 'Client toggled Door Lock from LOCKED to UNLOCKED');

    // Unpublish to DRAFT
    await PublishService.unpublishHouse(testHouse.id);

    // Client portal should now block access
    const blockedClientData = await ClientPortalService.getClientDashboard(testHouse.id);
    assert(blockedClientData.isPublished === false, 'Client portal blocks access to unpublished DRAFT dashboard');
    assert(!!blockedClientData.message, 'Client portal returns friendly placeholder configuration message');

    // Control attempt on unpublished house should throw error
    let controlBlocked = false;
    try {
      await ClientPortalService.controlDevice(testHouse.id, deviceA.id, { action: 'TOGGLE_POWER' });
    } catch (err: any) {
      controlBlocked = true;
    }
    assert(controlBlocked, 'Client device control strictly blocked for unpublished dashboards');

  } catch (err) {
    console.error('Test execution error:', err);
    testsFailed++;
  } finally {
    // ----------------------------------------------------
    // 6. SELECTIVE CLEANUP
    // ----------------------------------------------------
    console.log('\n🧹 Test Group 6: Selective Test Data Cleanup');
    if (testHouse) {
      await prisma.device.deleteMany({ where: { houseId: testHouse.id } });
      if (testFloor) {
        await prisma.room.deleteMany({ where: { floorId: testFloor.id } });
        await prisma.floorPlan.deleteMany({ where: { floorId: testFloor.id } });
        await prisma.floor.deleteMany({ where: { id: testFloor.id } });
      }
      await prisma.house.delete({ where: { id: testHouse.id } });
      console.log('  ✅ Test house and associated test entities cleaned up cleanly');
    }
  }

  console.log('\n====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('====================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
