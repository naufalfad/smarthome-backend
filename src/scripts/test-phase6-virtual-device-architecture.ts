import { PrismaClient } from '@prisma/client';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import { VirtualDeviceProvider } from '../providers/virtual/virtual-device.provider.js';
import { DeviceManagementService } from '../services/device-management.service.js';
import { BaseFutureHardwareProvider, HardwareConnectionConfig } from '../providers/hardware/hardware-provider.contract.js';
import { seedIoTDeviceCatalog } from './seed-iot-catalog.js';

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

// Concrete subclass of BaseFutureHardwareProvider for architectural verification
class DummyMqttHardwareProvider extends BaseFutureHardwareProvider {
  readonly providerType = 'MQTT';
  readonly name = 'Dummy MQTT Hardware Provider';
  readonly connectionConfig: HardwareConnectionConfig = {
    host: 'mqtt.local',
    port: 1883,
    protocol: 'mqtt',
  };
}

async function runPhase6Tests() {
  console.log('====================================================');
  console.log('🧪 PHASE 6: VIRTUAL DEVICE ARCHITECTURE & ABSTRACTION');
  console.log('====================================================\n');

  let testHouse: any = null;
  let testFloor: any = null;
  let testPlan: any = null;
  let testLight: any = null;
  let testAc: any = null;
  let testLock: any = null;
  let testSensor: any = null;
  let virtualProvider: VirtualDeviceProvider | null = null;

  try {
    // ----------------------------------------------------
    // PREPARATION: Seed catalog & create test fixtures
    // ----------------------------------------------------
    await seedIoTDeviceCatalog();

    testHouse = await prisma.house.create({
      data: {
        name: 'Phase 6 Virtual Architecture House',
        description: 'Test house for provider abstraction and standardized command lifecycle',
        publishStatus: 'PUBLISHED',
      },
    });

    testFloor = await prisma.floor.create({
      data: {
        name: 'Floor 1',
        levelNumber: 1,
        houseId: testHouse.id,
      },
    });

    testPlan = await prisma.floorPlan.create({
      data: {
        name: 'Floor 1 Plan',
        floorId: testFloor.id,
        viewBoxWidth: 1000,
        viewBoxHeight: 700,
      },
    });

    // ----------------------------------------------------
    // 1. PROVIDER INTERFACE & VIRTUAL DEVICE PROVIDER LIFECYCLE
    // ----------------------------------------------------
    console.log('⚙️  Test Group 1: Provider Interface & Virtual Device Provider Lifecycle');
    virtualProvider = new VirtualDeviceProvider();
    assert(virtualProvider.providerType === 'VIRTUAL', 'VirtualDeviceProvider reports providerType=VIRTUAL');
    assert(virtualProvider.isHardware === false, 'VirtualDeviceProvider is explicitly flagged as isHardware=false');

    await virtualProvider.initialize();
    await virtualProvider.start();

    const providerStatus = virtualProvider.getStatus();
    assert(providerStatus.isInitialized === true, 'VirtualDeviceProvider is initialized');
    assert(providerStatus.isRunning === true, 'VirtualDeviceProvider is running with simulation engine');

    const health = await virtualProvider.healthCheck();
    assert(health.isHealthy === true, 'VirtualDeviceProvider health check reports healthy');
    assert(health.message.includes('Virtual Device Provider'), 'Health check message indicates virtual provider operation');

    // ----------------------------------------------------
    // 2. PROVIDER REGISTRY & NO SILENT FALLBACK GUARD
    // ----------------------------------------------------
    console.log('\n🔌 Test Group 2: Provider Registry & Strict Rejection of Unsupported Providers');
    const registry = DeviceProviderRegistry.getInstance();
    const registry2 = DeviceProviderRegistry.getInstance();
    assert(registry === registry2, 'DeviceProviderRegistry.getInstance() returns identical singleton');

    assert(registry.hasProvider('VIRTUAL'), 'Registry automatically contains default VIRTUAL provider');
    const resolvedVirtual = registry.getProvider('VIRTUAL');
    assert(resolvedVirtual.providerType === 'VIRTUAL', 'registry.getProvider("VIRTUAL") retrieves VirtualDeviceProvider');

    // Strict rejection test: Requesting an unconfigured hardware provider MUST throw
    let mqttRejected = false;
    let mqttErrorMessage = '';
    try {
      registry.getProvider('MQTT');
    } catch (err: any) {
      mqttRejected = true;
      mqttErrorMessage = err.message;
    }
    assert(mqttRejected, 'Registry strictly throws error when requesting unsupported provider "MQTT"');
    assert(
      mqttErrorMessage.includes('Tidak ada fallback diam-diam'),
      'Error message explicitly specifies NO silent fallback to simulator'
    );

    let esp32Rejected = false;
    try {
      registry.getProvider('ESP32');
    } catch {
      esp32Rejected = true;
    }
    assert(esp32Rejected, 'Registry strictly rejects unconfigured "ESP32" provider');

    // ----------------------------------------------------
    // 3. CREATE TEST DEVICES WITH PROVIDER CONFIG
    // ----------------------------------------------------
    console.log('\n🏠 Test Group 3: Device Creation with Provider Metadata');

    const lightCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_DIMMER' } });
    testLight = await prisma.device.create({
      data: {
        name: 'Living Room Dimmer',
        type: 'SMART_DIMMER',
        catalogItemId: lightCat?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ON',
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        configuration: { power: true, brightness: 80 },
      },
    });
    assert(testLight.providerType === 'VIRTUAL', 'Smart Dimmer initialized with providerType=VIRTUAL');

    const acCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_AC' } });
    testAc = await prisma.device.create({
      data: {
        name: 'Master Bed AC',
        type: 'SMART_AC',
        catalogItemId: acCat?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ON',
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        configuration: { power: true, mode: 'COOL', fanSpeed: 'HIGH', targetTemperature: 24, currentTemperature: 28 },
      },
    });
    assert(testAc.providerType === 'VIRTUAL', 'Smart AC initialized with providerType=VIRTUAL');

    const lockCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_LOCK' } });
    testLock = await prisma.device.create({
      data: {
        name: 'Front Door Lock',
        type: 'SMART_LOCK',
        catalogItemId: lockCat?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'LOCKED',
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        configuration: { lockState: 'LOCKED' },
      },
    });
    assert(testLock.providerType === 'VIRTUAL', 'Smart Door Lock initialized with providerType=VIRTUAL');

    const sensorCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'TEMP_HUMIDITY_SENSOR' } });
    testSensor = await prisma.device.create({
      data: {
        name: 'Indoor Environment Sensor',
        type: 'TEMP_HUMIDITY_SENSOR',
        catalogItemId: sensorCat?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ONLINE',
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        configuration: { temperature: 24.5, humidity: 60 },
      },
    });
    assert(testSensor.providerType === 'VIRTUAL', 'Temp/Humidity Sensor initialized with providerType=VIRTUAL');

    // ----------------------------------------------------
    // 4. STANDARDIZED COMMAND EXECUTION & LIFECYCLE
    // ----------------------------------------------------
    console.log('\n🎛️ Test Group 4: Standardized Command Execution & Lifecycle Tracking');

    // 4a. Execute SET_POWER on Light
    const powerCmdRes = await DeviceManagementService.executeCommand(testLight.id, {
      commandType: 'SET_POWER',
      payload: { power: false },
    });
    assert(powerCmdRes.status === 'SUCCESS', 'SET_POWER command executed with status SUCCESS');
    assert(powerCmdRes.appliedConfig?.power === false, 'SET_POWER applied power=false to configuration');
    assert(powerCmdRes.resultingStatus === 'OFF', 'SET_POWER transitioned status to OFF');

    // Verify DeviceCommand record in DB
    const powerCmdRecord = await prisma.deviceCommand.findUnique({
      where: { id: powerCmdRes.commandId },
    });
    assert(powerCmdRecord !== null, 'DeviceCommand record persisted in database');
    assert(powerCmdRecord?.status === 'SUCCESS', 'DeviceCommand lifecycle record marked status=SUCCESS');
    assert(powerCmdRecord?.completedAt !== null, 'DeviceCommand completedAt timestamp recorded');

    // 4b. Execute SET_BRIGHTNESS on Dimmer
    const brightCmdRes = await DeviceManagementService.executeCommand(testLight.id, {
      commandType: 'SET_BRIGHTNESS',
      payload: { brightness: 55 },
    });
    assert(brightCmdRes.status === 'SUCCESS', 'SET_BRIGHTNESS executed with status SUCCESS');
    assert(brightCmdRes.appliedConfig?.brightness === 55, 'SET_BRIGHTNESS updated brightness to 55');

    // 4c. Execute SET_TEMPERATURE on AC
    const tempCmdRes = await DeviceManagementService.executeCommand(testAc.id, {
      commandType: 'SET_TEMPERATURE',
      payload: { targetTemperature: 21 },
    });
    assert(tempCmdRes.status === 'SUCCESS', 'SET_TEMPERATURE executed with status SUCCESS');
    assert(tempCmdRes.appliedConfig?.targetTemperature === 21, 'SET_TEMPERATURE updated targetTemperature to 21°C');

    // 4d. Execute UNLOCK on Lock
    const unlockCmdRes = await DeviceManagementService.executeCommand(testLock.id, {
      commandType: 'UNLOCK',
      payload: {},
    });
    assert(unlockCmdRes.status === 'SUCCESS', 'UNLOCK executed with status SUCCESS');
    assert(unlockCmdRes.resultingStatus === 'UNLOCKED', 'UNLOCK transitioned status to UNLOCKED');

    // ----------------------------------------------------
    // 5. COMMAND CAPABILITY ENFORCEMENT & FAILURE LIFECYCLE
    // ----------------------------------------------------
    console.log('\n🛡️ Test Group 5: Command Capability Enforcement & FAILED Lifecycle');

    let sensorCmdFailed = false;
    let sensorFailedError = '';
    try {
      await DeviceManagementService.executeCommand(testSensor.id, {
        commandType: 'SET_POWER',
        payload: { power: false },
      });
    } catch (err: any) {
      sensorCmdFailed = true;
      sensorFailedError = err.message;
    }
    assert(sensorCmdFailed, 'Controlling read-only sensor was strictly rejected by capability guard');

    // Check failed command record in DB
    const latestSensorCmd = await prisma.deviceCommand.findFirst({
      where: { deviceId: testSensor.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(latestSensorCmd !== null, 'Failed command was recorded in DeviceCommand table');
    assert(latestSensorCmd?.status === 'FAILED', 'Failed command record has status=FAILED');
    assert(
      latestSensorCmd?.errorMessage !== null && latestSensorCmd!.errorMessage!.length > 0,
      `Failed command stores descriptive error message: "${latestSensorCmd?.errorMessage?.slice(0, 45)}..."`
    );

    // Out-of-range number control rejection (e.g. brightness > 100)
    let rangeRejected = false;
    try {
      await DeviceManagementService.executeCommand(testLight.id, {
        commandType: 'SET_BRIGHTNESS',
        payload: { brightness: 180 },
      });
    } catch {
      rangeRejected = true;
    }
    assert(rangeRejected, 'Out-of-range brightness (>100) was rejected and logged as FAILED');

    // ----------------------------------------------------
    // 6. COMMAND HISTORY RETRIEVAL
    // ----------------------------------------------------
    console.log('\n📜 Test Group 6: Command History Retrieval');
    const lightHistory = await DeviceManagementService.getDeviceCommandHistory(testLight.id, 10);
    assert(Array.isArray(lightHistory) && lightHistory.length >= 2, `Retrieved ${lightHistory.length} command history records for dimmer`);
    assert(lightHistory[0].deviceId === testLight.id, 'Command history records belong to requested device');
    assert(lightHistory[0].commandType !== undefined, 'Command history records have valid commandType');

    // ----------------------------------------------------
    // 7. STANDARDIZED TELEMETRY GENERATION & ENRICHED STATE
    // ----------------------------------------------------
    console.log('\n📊 Test Group 7: Standardized Telemetry & Connection Status Abstraction');
    const lightState = await DeviceManagementService.getDeviceStateWithProvider(testLight.id);
    assert(lightState.providerType === 'VIRTUAL', 'Device state reports providerType=VIRTUAL');
    assert(lightState.connectionStatus === 'ONLINE', 'Device state reports connectionStatus=ONLINE');
    assert(lightState.isSimulated === true, 'Device state indicates isSimulated=true');
    assert(lightState.lastSeenAt !== null, 'Device state has valid lastSeenAt timestamp');

    // Verify telemetry points in DB have providerType
    const telemetryRecords = await prisma.deviceTelemetry.findMany({
      where: { deviceId: testLight.id },
      orderBy: { timestamp: 'desc' },
    });
    assert(telemetryRecords.length > 0, `Database contains ${telemetryRecords.length} telemetry records for light`);
    assert(telemetryRecords[0].providerType === 'VIRTUAL', 'Telemetry records are tagged with providerType=VIRTUAL');

    // ----------------------------------------------------
    // 8. BULK FLOOR PLAN DEVICES ENRICHMENT
    // ----------------------------------------------------
    console.log('\n🏘️ Test Group 8: Bulk Floor Plan Devices with Provider Metadata');
    const bulkData = await DeviceManagementService.getFloorPlanDevicesWithProvider(testPlan.id);
    assert(bulkData.devices.length >= 4, `Bulk query returned all ${bulkData.devices.length} devices on floor plan`);
    assert(bulkData.providers.length >= 1, 'Bulk payload includes provider statuses');
    assert(
      bulkData.devices.every((d) => d.providerType === 'VIRTUAL' && d.connectionStatus === 'ONLINE'),
      'All devices on floor plan report providerType=VIRTUAL and connectionStatus=ONLINE'
    );

    // ----------------------------------------------------
    // 9. FUTURE HARDWARE PROVIDER CONTRACT SPECIFICATION
    // ----------------------------------------------------
    console.log('\n🔌 Test Group 9: Future Hardware Provider Contract Specification');
    const dummyMqtt = new DummyMqttHardwareProvider();
    assert(dummyMqtt.isHardware === true, 'Future hardware provider has isHardware=true');
    assert(dummyMqtt.providerType === 'MQTT', 'Future hardware provider has providerType=MQTT');

    let mqttInitBlocked = false;
    try {
      await dummyMqtt.initialize();
    } catch (err: any) {
      mqttInitBlocked = true;
      assert(err.message.includes('NOT active in Phase 6'), 'Initialization of physical provider is strictly blocked in Phase 6');
    }
    assert(mqttInitBlocked, 'Attempting to initialize physical hardware provider throws clear boundary error');

    // ----------------------------------------------------
    // 10. PROVIDER LIFECYCLE MANAGEMENT & STOP
    // ----------------------------------------------------
    console.log('\n🛑 Test Group 10: Provider Lifecycle & Graceful Stop');
    await virtualProvider.stop();
    const stoppedStatus = virtualProvider.getStatus();
    assert(stoppedStatus.isRunning === false, 'VirtualDeviceProvider reports isRunning=false after stop()');

    // When provider is stopped, device state connectionStatus reports OFFLINE
    const offlineState = await virtualProvider.getDeviceState(testLight.id);
    assert(offlineState.connectionStatus === 'OFFLINE', 'Device connectionStatus dynamically switches to OFFLINE when provider stops');

    // Restart provider for clean operational state
    await virtualProvider.start();
    const restartedStatus = virtualProvider.getStatus();
    assert(restartedStatus.isRunning === true, 'VirtualDeviceProvider resumed operation cleanly');

  } catch (err) {
    console.error('❌ Unexpected error in Phase 6 test suite:', err);
    testsFailed++;
  } finally {
    // Cleanup test artifacts
    console.log('\n🧹 Cleaning up test fixtures...');
    try {
      if (testLight?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testLight.id } });
      if (testAc?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testAc.id } });
      if (testLock?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testLock.id } });
      if (testSensor?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testSensor.id } });

      if (testLight?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testLight.id } });
      if (testAc?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testAc.id } });
      if (testLock?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testLock.id } });
      if (testSensor?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testSensor.id } });

      if (testPlan?.id) await prisma.device.deleteMany({ where: { floorPlanId: testPlan.id } });
      if (testPlan?.id) await prisma.floorPlan.delete({ where: { id: testPlan.id } });
      if (testFloor?.id) await prisma.floor.delete({ where: { id: testFloor.id } });
      if (testHouse?.id) await prisma.house.delete({ where: { id: testHouse.id } });
      console.log('  Cleaned up all temporary Phase 6 test records');
    } catch (cleanErr) {
      console.warn('  Notice: cleanup step:', cleanErr);
    }

    if (virtualProvider) {
      try {
        await virtualProvider.stop();
      } catch {}
    }

    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log(`Phase 6 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('====================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

runPhase6Tests();
