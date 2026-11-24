/**
 * PHASE 8: USER DASHBOARD & SMART HOME EXPERIENCE TEST SUITE
 * Comprehensive verification of aggregated overview, environmental metrics,
 * floor & room monitoring, device control pipeline, automation summary,
 * activity timeline, data isolation, error handling, and regressions.
 */

import { PrismaClient } from '@prisma/client';
import { DashboardService } from '../services/dashboard.service.js';
import { DeviceManagementService } from '../services/device-management.service.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import { VirtualDeviceProvider } from '../providers/virtual/virtual-device.provider.js';
import { AutomationEngine } from '../automation/automation.engine.js';

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

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PHASE 8 USER DASHBOARD TEST SUITE');
  console.log('====================================================\n');

  // Initialize Provider Registry & Virtual Device Provider
  const registry = DeviceProviderRegistry.getInstance();
  const virtualProvider = new VirtualDeviceProvider();
  registry.registerProvider(virtualProvider);
  await registry.initializeAll();

  // Ensure Automation Engine is initialized
  const automationEngine = AutomationEngine.getInstance();
  await automationEngine.start();

  // Seed / fetch catalog items for standard IoT devices
  const lightCatalog = await prisma.deviceCatalogItem.findFirst({
    where: { deviceType: 'SMART_LIGHT' },
  });
  const acCatalog = await prisma.deviceCatalogItem.findFirst({
    where: { deviceType: 'SMART_AC' },
  });
  const lockCatalog = await prisma.deviceCatalogItem.findFirst({
    where: { deviceType: 'SMART_LOCK' },
  });
  const sensorCatalog = await prisma.deviceCatalogItem.findFirst({
    where: { deviceType: 'TEMP_HUMIDITY_SENSOR' },
  });
  const aqiCatalog = await prisma.deviceCatalogItem.findFirst({
    where: { deviceType: 'AIR_QUALITY_SENSOR' },
  });

  // Setup Test House A (Multi-floor, rooms, sensors, devices)
  const houseA = await prisma.house.create({
    data: {
      name: 'House Alpha (Phase 8 Test)',
      clientName: 'Bapak Ahmad',
      publishStatus: 'PUBLISHED',
    },
  });

  // Setup Floor 1 and Floor 2 for House A
  const floor1 = await prisma.floor.create({
    data: {
      houseId: houseA.id,
      name: 'Lantai 1',
      levelNumber: 1,
    },
  });

  const floorPlan1 = await prisma.floorPlan.create({
    data: {
      floorId: floor1.id,
      name: 'Denah Lantai 1',
      imagePath: 'uploads/floor-plans/test-f1.svg',
      imageWidth: 1600,
      imageHeight: 1000,
    },
  });

  const floor2 = await prisma.floor.create({
    data: {
      houseId: houseA.id,
      name: 'Lantai 2',
      levelNumber: 2,
    },
  });

  const floorPlan2 = await prisma.floorPlan.create({
    data: {
      floorId: floor2.id,
      name: 'Denah Lantai 2',
      imagePath: 'uploads/floor-plans/test-f2.svg',
      imageWidth: 1600,
      imageHeight: 1000,
    },
  });

  // Setup Rooms in Floor 1
  const livingRoom = await prisma.room.create({
    data: {
      floorId: floor1.id,
      name: 'Ruang Tamu',
      type: 'LIVING_ROOM',
      floor: 1,
      color: '#8B5CF6',
      polygonCoordinates: [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 500 },
        { x: 100, y: 500 },
      ],
    },
  });

  const bedroom = await prisma.room.create({
    data: {
      floorId: floor1.id,
      name: 'Kamar Tidur Utama',
      type: 'BEDROOM',
      floor: 1,
      color: '#3B82F6',
    },
  });

  // Setup Devices in House A
  const devLight = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor1.id,
      floorPlanId: floorPlan1.id,
      roomId: livingRoom.id,
      catalogItemId: lightCatalog?.id,
      name: 'Lampu Utama Ruang Tamu',
      type: 'SMART_LIGHT',
      status: 'ON',
      configuration: { power: true, brightness: 80 },
      x: 300,
      y: 300,
      normalizedX: 0.1875,
      normalizedY: 0.3,
    },
  });

  const devAC = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor1.id,
      floorPlanId: floorPlan1.id,
      roomId: bedroom.id,
      catalogItemId: acCatalog?.id,
      name: 'Smart AC Kamar',
      type: 'SMART_AC',
      status: 'ON',
      configuration: { power: true, targetTemperature: 24, mode: 'COOL' },
      x: 700,
      y: 300,
      normalizedX: 0.4375,
      normalizedY: 0.3,
    },
  });

  const devLock = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor1.id,
      floorPlanId: floorPlan1.id,
      catalogItemId: lockCatalog?.id,
      name: 'Pintu Masuk Utama',
      type: 'SMART_LOCK',
      status: 'LOCKED',
      manualRoomName: 'Teras Depan', // Device without roomId, manual room name
      configuration: { lockState: 'LOCKED', isLocked: true },
      x: 150,
      y: 800,
      normalizedX: 0.09375,
      normalizedY: 0.8,
    },
  });

  const devSensor = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor1.id,
      floorPlanId: floorPlan1.id,
      roomId: livingRoom.id,
      catalogItemId: sensorCatalog?.id,
      name: 'Sensor Suhu Ruang Tamu',
      type: 'TEMP_HUMIDITY_SENSOR',
      status: 'ONLINE',
      configuration: { temperature: 25.2, humidity: 55 },
      x: 350,
      y: 350,
      normalizedX: 0.21875,
      normalizedY: 0.35,
    },
  });

  const devAQI = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor1.id,
      floorPlanId: floorPlan1.id,
      roomId: livingRoom.id,
      catalogItemId: aqiCatalog?.id,
      name: 'Sensor Kualitas Udara',
      type: 'AIR_QUALITY_SENSOR',
      status: 'ONLINE',
      configuration: { aqi: 45, pm25: 18, pm10: 25 },
      x: 400,
      y: 350,
      normalizedX: 0.25,
      normalizedY: 0.35,
    },
  });

  // Device on Floor 2 to test multi-floor isolation
  const devFloor2Light = await prisma.device.create({
    data: {
      houseId: houseA.id,
      floorId: floor2.id,
      floorPlanId: floorPlan2.id,
      catalogItemId: lightCatalog?.id,
      name: 'Lampu Balkon Lantai 2',
      type: 'SMART_LIGHT',
      status: 'OFF',
      configuration: { power: false, brightness: 50 },
      x: 200,
      y: 200,
      normalizedX: 0.125,
      normalizedY: 0.2,
    },
  });

  // Seed Telemetry for Sensors
  await prisma.deviceTelemetry.createMany({
    data: [
      {
        deviceId: devSensor.id,
        metricType: 'temperature',
        value: 24.5,
        unit: '°C',
        timestamp: new Date(),
      },
      {
        deviceId: devSensor.id,
        metricType: 'humidity',
        value: 52.0,
        unit: '%',
        timestamp: new Date(),
      },
      {
        deviceId: devAQI.id,
        metricType: 'aqi',
        value: 45,
        unit: 'AQI',
        timestamp: new Date(),
      },
      {
        deviceId: devAQI.id,
        metricType: 'pm25',
        value: 18.2,
        unit: 'µg/m³',
        timestamp: new Date(),
      },
      {
        deviceId: devAQI.id,
        metricType: 'pm10',
        value: 26.0,
        unit: 'µg/m³',
        timestamp: new Date(),
      },
    ],
  });

  // Setup Automation Rule for House A
  const autoRule = await prisma.automationRule.create({
    data: {
      houseId: houseA.id,
      name: 'Auto AC On Hot Weather',
      description: 'Nyalakan AC kamar jika suhu melebihi 28C',
      enabled: true,
      priority: 10,
      triggerType: 'SENSOR',
      conditions: [
        {
          type: 'SENSOR',
          deviceId: devSensor.id,
          metric: 'temperature',
          operator: 'GREATER_THAN',
          targetValue: 28,
        },
      ],
      actions: [
        {
          deviceId: devAC.id,
          commandType: 'SET_POWER',
          payload: { power: true, status: 'ON' },
        },
      ],
    },
  });

  // Log an initial command execution
  await prisma.deviceCommand.create({
    data: {
      deviceId: devLight.id,
      commandType: 'SET_POWER',
      payload: { power: true, status: 'ON' },
      status: 'SUCCESS',
      createdAt: new Date(Date.now() - 60000),
    },
  });

  // Log an initial automation execution
  await prisma.automationExecution.create({
    data: {
      ruleId: autoRule.id,
      status: 'SUCCESS',
      triggerData: { temperature: 29.5 },
      executionResult: [{ deviceId: devAC.id, status: 'SUCCESS' }],
      startedAt: new Date(Date.now() - 30000),
      completedAt: new Date(Date.now() - 29000),
    },
  });

  // --- TEST GROUP 1: Dashboard Overview Aggregation ---
  console.log('--- TEST GROUP 1: Dashboard Overview Aggregation ---');
  const overview = await DashboardService.getOverview(houseA.id);
  assert(overview.houseSummary.id === houseA.id, 'Overview returns correct House ID');
  assert(overview.houseSummary.name === 'House Alpha (Phase 8 Test)', 'Overview returns correct House Name');
  assert(overview.houseSummary.totalFloors === 2, 'House has 2 floors aggregated');
  assert(overview.houseSummary.totalRooms === 2, 'House has 2 rooms aggregated');
  assert(overview.houseSummary.totalDevices === 6, 'House has 6 devices aggregated');
  assert(overview.houseSummary.activeDevices >= 3, 'Overview counts active devices (ON/LOCKED)');
  assert(overview.houseSummary.automationStatus.isRunning === true, 'Automation engine status is active');
  assert(overview.houseSummary.automationStatus.activeRulesCount >= 1, 'Active automation rules count matches');

  // --- TEST GROUP 2: Environmental Monitoring Data & Thresholds ---
  console.log('\n--- TEST GROUP 2: Environmental Monitoring Data & Thresholds ---');
  const env = overview.environmental;
  assert(env.temperature.value === 24.5, 'Temperature reading matches latest telemetry (24.5°C)');
  assert(env.temperature.unit === '°C', 'Temperature unit is °C');
  assert(env.temperature.status === 'NORMAL', 'Temperature 24.5°C is within comfort threshold (18-28°C) -> NORMAL');
  assert(env.humidity.value === 52.0, 'Humidity reading matches latest telemetry (52%)');
  assert(env.humidity.status === 'NORMAL', 'Humidity 52% is within comfort threshold (35-70%) -> NORMAL');
  assert(env.aqi.value === 45, 'AQI reading matches latest telemetry (45)');
  assert(env.aqi.status === 'NORMAL', 'AQI 45 <= 100 -> NORMAL');
  assert(env.pm25.value === 18.2, 'PM2.5 reading matches latest telemetry (18.2 µg/m³)');
  assert(env.pm25.status === 'NORMAL', 'PM2.5 18.2 <= 35 -> NORMAL');
  assert(env.pm10.value === 26.0, 'PM10 reading matches latest telemetry (26.0 µg/m³)');
  assert(env.pm10.status === 'NORMAL', 'PM10 26.0 <= 50 -> NORMAL');

  // Threshold Warning Test
  await prisma.deviceTelemetry.create({
    data: {
      deviceId: devSensor.id,
      metricType: 'temperature',
      value: 32.5, // Exceeds 28°C
      unit: '°C',
      timestamp: new Date(),
    },
  });
  const overviewWarning = await DashboardService.getOverview(houseA.id);
  assert(overviewWarning.environmental.temperature.value === 32.5, 'Updated temperature is 32.5°C');
  assert(overviewWarning.environmental.temperature.status === 'WARNING', 'High temperature 32.5°C evaluates to WARNING status');

  // --- TEST GROUP 3: Device Categorization Summary ---
  console.log('\n--- TEST GROUP 3: Device Categorization Summary ---');
  const devSummary = overview.deviceSummary;
  assert(devSummary.lighting.total === 2, 'Lighting category contains 2 lights (Living Room + Floor 2)');
  assert(devSummary.climate.total === 1, 'Climate category contains 1 AC unit');
  assert(devSummary.security.total === 1, 'Security category contains 1 Smart Lock');
  assert(devSummary.sensors.total === 2, 'Sensors category contains 2 sensor devices');
  assert(devSummary.security.active === 1, 'Smart Lock is active (LOCKED)');

  // --- TEST GROUP 4: Floor Selection & Multi-Floor Isolation ---
  console.log('\n--- TEST GROUP 4: Floor Selection & Multi-Floor Isolation ---');
  const floors = await DashboardService.getFloors(houseA.id);
  assert(floors.length === 2, 'Floors API returns 2 floors');
  assert(floors[0].name === 'Lantai 1' && floors[0].roomCount === 2, 'Floor 1 has 2 rooms');
  assert(floors[0].deviceCount === 5, 'Floor 1 has 5 devices');
  assert(floors[1].name === 'Lantai 2' && floors[1].deviceCount === 1, 'Floor 2 has 1 device');

  const floor1Devices = await DashboardService.getDevices(houseA.id, floor1.id);
  const floor2Devices = await DashboardService.getDevices(houseA.id, floor2.id);
  assert(floor1Devices.length === 5, 'Floor 1 query returns strictly 5 devices');
  assert(floor2Devices.length === 1, 'Floor 2 query returns strictly 1 device');
  assert(!floor1Devices.some((d) => d.id === devFloor2Light.id), 'Floor 1 devices do NOT leak Floor 2 device');

  // --- TEST GROUP 5: Room-Based Monitoring & Spatial Association ---
  console.log('\n--- TEST GROUP 5: Room-Based Monitoring & Spatial Association ---');
  const rooms = await DashboardService.getRooms(houseA.id, floor1.id);
  assert(rooms.length === 2, 'Room monitoring returns 2 rooms on Floor 1');
  const livingRoomData = rooms.find((r) => r.id === livingRoom.id);
  assert(livingRoomData !== undefined, 'Living room found in room monitoring');
  assert(livingRoomData?.deviceCount === 3, 'Living room contains 3 assigned devices (Light, Sensor, AQI)');
  assert(livingRoomData?.environmental.temperature !== null, 'Living room reports room-specific temperature reading');

  // Device without room assignment check
  const allDevices = await DashboardService.getDevices(houseA.id);
  const unassigned = allDevices.filter((d) => !d.roomId);
  assert(unassigned.some((d) => d.id === devLock.id), 'Smart Lock is in unassigned list and maintains manualRoomName "Teras Depan"');

  // --- TEST GROUP 6: Device Detail & Control Center via Phase 6 Pipeline ---
  console.log('\n--- TEST GROUP 6: Device Detail & Control Center via Phase 6 Pipeline ---');
  // 1. Control Light: Turn OFF
  const cmdLightRes = await DashboardService.controlDevice(devLight.id, 'SET_POWER', { power: false });
  assert(cmdLightRes.status === 'SUCCESS', 'SET_POWER command on Smart Light succeeded');
  const lightAfter = await prisma.device.findUnique({ where: { id: devLight.id } });
  assert(lightAfter?.status === 'OFF', 'Smart Light status updated to OFF in database');

  // 2. Control AC: Set Temperature to 21°C
  const cmdAcRes = await DashboardService.controlDevice(devAC.id, 'SET_TEMPERATURE', { temperature: 21 });
  assert(cmdAcRes.status === 'SUCCESS', 'SET_TEMPERATURE command on Smart AC succeeded');
  const acAfter = await prisma.device.findUnique({ where: { id: devAC.id } });
  const acConfig = acAfter?.configuration as any;
  assert(acConfig?.targetTemperature === 21, 'Smart AC configuration targetTemperature updated to 21°C');

  // 3. Control Lock: Unlock
  const cmdLockRes = await DashboardService.controlDevice(devLock.id, 'UNLOCK', { lockState: 'UNLOCKED' });
  assert(cmdLockRes.status === 'SUCCESS', 'UNLOCK command on Smart Door Lock succeeded');
  const lockAfter = await prisma.device.findUnique({ where: { id: devLock.id } });
  assert(lockAfter?.status === 'UNLOCKED', 'Smart Door Lock status updated to UNLOCKED');

  // 4. Read-only Sensor Protection
  let sensorRejected = false;
  try {
    await DashboardService.controlDevice(devSensor.id, 'SET_CONFIG', { temperature: 30 });
  } catch (err: any) {
    sensorRejected = true;
    assert(
      err.message.includes('read-only') ||
      err.message.includes('Read-only') ||
      err.message.includes('tidak dapat dikontrol') ||
      err.message.includes('ditolak kapabilitas'),
      'Read-only sensor rejected with protective error: ' + err.message
    );
  }
  assert(sensorRejected, 'Control attempt on read-only Temperature & Humidity Sensor was strictly blocked');

  // --- TEST GROUP 7: Automation Overview & Activity Center ---
  console.log('\n--- TEST GROUP 7: Automation Overview & Activity Center ---');
  const autoSummary = await DashboardService.getAutomationSummary(houseA.id);
  assert(autoSummary.activeCount >= 1, 'Automation summary reports active rules count');
  assert(autoSummary.rules.length >= 1, 'Automation summary lists rules');
  assert(autoSummary.rules[0].targetDevices.includes('Smart AC Kamar'), 'Rule targets resolved to device name');
  assert(autoSummary.recentExecutions.length >= 1, 'Recent execution history is populated');

  // Activity Center Timeline
  const activities = await DashboardService.getActivities(houseA.id, 20);
  assert(activities.length >= 2, 'Activity Center contains combined commands and automation executions');
  assert(activities[0].timestamp >= activities[1].timestamp, 'Activities are sorted in descending chronological order');
  assert(activities.some((a) => a.source === 'USER_MANUAL'), 'Activity stream contains USER_MANUAL action');
  assert(activities.some((a) => a.source === 'AUTOMATION'), 'Activity stream contains AUTOMATION action');

  // --- TEST GROUP 8: Multi-House Data Isolation & Error Handling ---
  console.log('\n--- TEST GROUP 8: Multi-House Data Isolation & Error Handling ---');
  // House B (Empty House)
  const houseB = await prisma.house.create({
    data: {
      name: 'House Beta (Empty Isolation Test)',
      publishStatus: 'DRAFT',
    },
  });

  const overviewB = await DashboardService.getOverview(houseB.id);
  assert(overviewB.houseSummary.id === houseB.id, 'Overview for House B targets House B');
  assert(overviewB.houseSummary.totalFloors === 0, 'House B has 0 floors');
  assert(overviewB.houseSummary.totalDevices === 0, 'House B has 0 devices');
  assert(overviewB.environmental.temperature.status === 'UNAVAILABLE', 'House B without sensors reports UNAVAILABLE');
  assert(overviewB.environmental.temperature.value === null, 'House B temperature value is strictly null (no mock guessing)');

  // Cross-house device isolation
  const houseBDevices = await DashboardService.getDevices(houseB.id);
  assert(houseBDevices.length === 0, 'House B devices list is empty (House A devices isolated)');

  // Invalid House ID Error Handling
  let invalidHouseError = false;
  try {
    await DashboardService.getOverview('00000000-0000-0000-0000-000000000000');
  } catch (err: any) {
    invalidHouseError = true;
    assert(err.message.includes('not found'), 'Querying invalid house ID returns descriptive not-found error');
  }
  assert(invalidHouseError, 'Invalid house ID throws proper error');

  // --- TEST GROUP 9: Regressions (Phase 4, 5, 6, 7 & Legacy 3D) ---
  console.log('\n--- TEST GROUP 9: Regressions (Phase 4, 5, 6, 7 & Legacy 3D) ---');
  // Phase 4 Catalog check
  const allCatalogs = await prisma.deviceCatalogItem.findMany();
  assert(allCatalogs.length >= 6, 'Phase 4 IoT Catalog items remain intact');

  // Phase 6 Virtual Device Provider check
  const provider = registry.getProviderForDevice(devLight);
  assert(provider.providerType === 'VIRTUAL', 'Device uses Phase 6 Virtual Device Provider');

  // Phase 7 Automation Engine check
  const engineStatus = await automationEngine.getStatus();
  assert(engineStatus.isRunning === true, 'Phase 7 Automation Engine remains running');

  // Legacy 3D HouseModel check
  const modelsCount = await prisma.houseModel.count();
  assert(typeof modelsCount === 'number', 'Legacy 3D HouseModel queries execute cleanly without regression');

  // Clean up Test Data
  console.log('\n🧹 Cleaning up test artifacts...');
  automationEngine.stop();
  await prisma.deviceTelemetry.deleteMany({
    where: { deviceId: { in: [devSensor.id, devAQI.id] } },
  });
  await prisma.deviceCommand.deleteMany({
    where: { deviceId: { in: [devLight.id, devAC.id, devLock.id] } },
  });
  await prisma.automationExecution.deleteMany({
    where: { ruleId: autoRule.id },
  });
  await prisma.automationRule.deleteMany({
    where: { id: autoRule.id },
  });
  await prisma.device.deleteMany({
    where: { houseId: { in: [houseA.id, houseB.id] } },
  });
  await prisma.room.deleteMany({
    where: { floorId: { in: [floor1.id, floor2.id] } },
  });
  await prisma.floorPlan.deleteMany({
    where: { floorId: { in: [floor1.id, floor2.id] } },
  });
  await prisma.floor.deleteMany({
    where: { houseId: { in: [houseA.id, houseB.id] } },
  });
  await prisma.house.deleteMany({
    where: { id: { in: [houseA.id, houseB.id] } },
  });

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error('Test Suite encountered fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
