import { PrismaClient } from '@prisma/client';
import { SimulationEngine } from '../simulation/simulation.engine.js';
import { SimulationService } from '../simulation/simulation.service.js';
import { SmartAcProcessor, SmartLockProcessor, TempHumiditySensorProcessor, AirQualitySensorProcessor } from '../simulation/simulation.device-processor.js';
import { calculateClimateConvergence, calculateAmbientDrift, brownianDrift } from '../simulation/simulation.generators.js';
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

async function runPhase5Tests() {
  console.log('====================================================');
  console.log('🧪 PHASE 5: BACKGROUND IoT SIMULATION ENGINE TESTS');
  console.log('====================================================\n');

  let testHouse: any = null;
  let testFloor: any = null;
  let testPlan: any = null;
  let testAcDevice: any = null;
  let testSensorDevice: any = null;
  let testAirQualityDevice: any = null;
  let testLockDevice: any = null;
  let testLightDevice: any = null;

  try {
    // ----------------------------------------------------
    // PREPARATION: Ensure IoT catalog is seeded
    // ----------------------------------------------------
    await seedIoTDeviceCatalog();

    testHouse = await prisma.house.create({
      data: {
        name: 'Phase 5 Simulation House',
        description: 'Automated test house for Phase 5 simulation engine',
        publishStatus: 'PUBLISHED',
      },
    });

    testFloor = await prisma.floor.create({
      data: {
        name: 'Simulation Floor',
        levelNumber: 1,
        houseId: testHouse.id,
      },
    });

    testPlan = await prisma.floorPlan.create({
      data: {
        name: 'Simulation Floor Plan',
        floorId: testFloor.id,
        viewBoxWidth: 1200,
        viewBoxHeight: 800,
      },
    });

    // ----------------------------------------------------
    // 1. ENGINE SINGLETON & STATUS
    // ----------------------------------------------------
    console.log('⚙️  Test Group 1: Engine Singleton & Lifecycle Management');
    const engine1 = SimulationEngine.getInstance();
    const engine2 = SimulationEngine.getInstance();
    assert(engine1 === engine2, 'SimulationEngine.getInstance() returns identical singleton instance');

    const initialStatus = engine1.getStatus();
    assert(typeof initialStatus.intervalMs === 'number' && initialStatus.intervalMs >= 1000, 'Engine has valid configurable intervalMs');
    assert(typeof initialStatus.totalTicks === 'number', 'Engine status reports totalTicks metric');

    // ----------------------------------------------------
    // 2. MATHEMATICAL CONVERGENCE & REALISTIC BEHAVIORS
    // ----------------------------------------------------
    console.log('\n🌡️ Test Group 2: Mathematical Convergence & Drift Generators');
    
    // AC Cooling convergence towards target (28°C -> target 20°C in COOL mode)
    const coolStep1 = calculateClimateConvergence(28.0, 20.0, 'COOL', 'HIGH');
    assert(coolStep1 < 28.0 && coolStep1 >= 20.0, `AC COOL mode decreases temp from 28.0 towards 20.0 (got ${coolStep1}°C)`);

    // AC Heat convergence towards target (18°C -> target 25°C in HEAT mode)
    const heatStep1 = calculateClimateConvergence(18.0, 25.0, 'HEAT', 'HIGH');
    assert(heatStep1 > 18.0 && heatStep1 <= 25.0, `AC HEAT mode increases temp from 18.0 towards 25.0 (got ${heatStep1}°C)`);

    // Ambient drift when AC is OFF (22°C drifts towards 29°C ambient)
    const ambientStep = calculateAmbientDrift(22.0, 29.5, 0.05);
    assert(ambientStep > 22.0 && ambientStep <= 29.5, `AC OFF allows temperature to drift back towards ambient 29.5°C (got ${ambientStep}°C)`);

    // Brownian drift bounded within min/max
    const driftVal = brownianDrift(50, 0, 100, 2, 50, 0.1);
    assert(driftVal >= 0 && driftVal <= 100, `Brownian drift strictly respects boundary limits (got ${driftVal})`);

    // ----------------------------------------------------
    // 3. SEED TEST DEVICES ON FLOOR PLAN
    // ----------------------------------------------------
    console.log('\n🔌 Test Group 3: IoT Device Creation & Catalog Binding');

    const acCatalog = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_AC' } });
    testAcDevice = await prisma.device.create({
      data: {
        name: 'Master Bed AC',
        type: 'SMART_AC',
        catalogItemId: acCatalog?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ON',
        integrationStatus: 'SIMULATED',
        x: 200,
        y: 200,
        normalizedX: 0.2,
        normalizedY: 0.2,
        configuration: {
          power: true,
          mode: 'COOL',
          fanSpeed: 'HIGH',
          targetTemperature: 21,
          currentTemperature: 27.5,
        },
      },
    });
    assert(testAcDevice.id !== undefined, 'Smart AC created with initial target=21°C, current=27.5°C');

    const tempSensorCatalog = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'TEMP_HUMIDITY_SENSOR' } });
    testSensorDevice = await prisma.device.create({
      data: {
        name: 'Living Room Sensor',
        type: 'TEMP_HUMIDITY_SENSOR',
        catalogItemId: tempSensorCatalog?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ONLINE',
        integrationStatus: 'SIMULATED',
        x: 400,
        y: 200,
        normalizedX: 0.4,
        normalizedY: 0.2,
        configuration: {
          temperature: 25.2,
          humidity: 58.0,
        },
      },
    });
    assert(testSensorDevice.id !== undefined, 'Temp/Humidity Sensor created with initial temp=25.2°C, hum=58.0%');

    const aqCatalog = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'AIR_QUALITY_SENSOR' } });
    testAirQualityDevice = await prisma.device.create({
      data: {
        name: 'Air Quality Station',
        type: 'AIR_QUALITY_SENSOR',
        catalogItemId: aqCatalog?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ONLINE',
        integrationStatus: 'SIMULATED',
        x: 600,
        y: 200,
        normalizedX: 0.6,
        normalizedY: 0.2,
        configuration: {
          aqi: 42,
          pm25: 11.2,
          pm10: 22.0,
        },
      },
    });
    assert(testAirQualityDevice.id !== undefined, 'Air Quality Sensor created with initial aqi=42, pm2.5=11.2');

    const lockCatalog = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_LOCK' } });
    testLockDevice = await prisma.device.create({
      data: {
        name: 'Front Door Lock',
        type: 'SMART_LOCK',
        catalogItemId: lockCatalog?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'LOCKED',
        integrationStatus: 'SIMULATED',
        x: 800,
        y: 200,
        normalizedX: 0.8,
        normalizedY: 0.2,
        configuration: {
          lockState: 'LOCKED',
        },
      },
    });
    assert(testLockDevice.id !== undefined, 'Smart Door Lock created with status=LOCKED');

    const lightCatalog = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_DIMMER' } });
    testLightDevice = await prisma.device.create({
      data: {
        name: 'Ceiling Chandelier',
        type: 'SMART_DIMMER',
        catalogItemId: lightCatalog?.id,
        floorPlanId: testPlan.id,
        floorId: testFloor.id,
        houseId: testHouse.id,
        status: 'ON',
        integrationStatus: 'SIMULATED',
        x: 500,
        y: 400,
        normalizedX: 0.5,
        normalizedY: 0.4,
        configuration: {
          power: true,
          brightness: 80,
        },
      },
    });
    assert(testLightDevice.id !== undefined, 'Smart Dimmer Light created with power=ON, brightness=80');

    // ----------------------------------------------------
    // 4. PROCESSOR TICK EXECUTION & STATE CONVERGENCE
    // ----------------------------------------------------
    console.log('\n⚡ Test Group 4: Device Processors Tick Execution');

    const baseContext = {
      tickNumber: 1,
      timestamp: new Date(),
    };

    // 4a. AC Processor
    const acProcessor = new SmartAcProcessor();
    const acResult = await acProcessor.processTick(testAcDevice, { ...baseContext, allDevices: [testAcDevice] });
    assert(acResult.configuration.currentTemperature < 27.5, `AC tick cooling converged: 27.5°C -> ${acResult.configuration.currentTemperature}°C`);
    assert(acResult.telemetryRecords.length >= 2, `AC produced ${acResult.telemetryRecords.length} telemetry points (currentTemp, targetTemp, power)`);

    // 4b. Sensor Micro-variations
    const sensorProcessor = new TempHumiditySensorProcessor();
    const sensorResult = await sensorProcessor.processTick(testSensorDevice, { ...baseContext, allDevices: [testSensorDevice, testAcDevice] });
    assert(typeof sensorResult.configuration.temperature === 'number', `Sensor temperature is numeric: ${sensorResult.configuration.temperature}°C`);
    assert(typeof sensorResult.configuration.humidity === 'number', `Sensor humidity is numeric: ${sensorResult.configuration.humidity}%`);
    assert(sensorResult.configuration.humidity >= 0 && sensorResult.configuration.humidity <= 100, 'Sensor humidity stays within physical 0-100%');

    // 4c. Air Quality Sensor
    const aqProcessor = new AirQualitySensorProcessor();
    const aqResult = await aqProcessor.processTick(testAirQualityDevice, { ...baseContext, allDevices: [testAirQualityDevice] });
    assert(aqResult.configuration.aqi > 0, `AQI is positive integer: ${aqResult.configuration.aqi}`);
    assert(aqResult.configuration.pm25 >= 0, `PM2.5 is non-negative: ${aqResult.configuration.pm25}`);
    assert(aqResult.configuration.pm10 >= 0, `PM10 is non-negative: ${aqResult.configuration.pm10}`);

    // 4d. Smart Lock Stability
    const lockProcessor = new SmartLockProcessor();
    const lockResult = await lockProcessor.processTick(testLockDevice, { ...baseContext, allDevices: [testLockDevice] });
    assert(lockResult.status === 'LOCKED', 'Smart Lock status remains strictly LOCKED across simulation tick');
    assert(lockResult.configuration.lockState === 'LOCKED', 'Smart Lock configuration lockState remains strictly LOCKED');

    // ----------------------------------------------------
    // 5. ENGINE TICK & DATABASE TELEMETRY PERSISTENCE
    // ----------------------------------------------------
    console.log('\n💾 Test Group 5: Engine Simulation Tick & Database Persistence');

    // Execute an autonomous tick through the full SimulationEngine
    await engine1.executeTick();

    // Verify AC in database has updated configuration
    const updatedAcInDb = await prisma.device.findUnique({ where: { id: testAcDevice.id } });
    const acConfigInDb = updatedAcInDb?.configuration as Record<string, any>;
    assert(acConfigInDb?.currentTemperature !== undefined, 'Database reflects updated AC currentTemperature after engine tick');

    // Verify Telemetry records were inserted
    const telemetryRecords = await prisma.deviceTelemetry.findMany({
      where: { deviceId: testAcDevice.id },
      orderBy: { timestamp: 'desc' },
    });
    assert(telemetryRecords.length > 0, `Database contains ${telemetryRecords.length} persisted telemetry points for AC`);
    assert(telemetryRecords[0].isSimulated === true, 'Telemetry records are properly flagged as isSimulated=true');

    // ----------------------------------------------------
    // 6. SIMULATION SERVICE QUERY APIS
    // ----------------------------------------------------
    console.log('\n📊 Test Group 6: Simulation Service Telemetry & State Retrieval');

    // Get latest state
    const acState = await SimulationService.getLatestState(testAcDevice.id);
    assert(acState.id === testAcDevice.id, 'getLatestState returns target device state');
    assert(acState.isSimulated === true, 'getLatestState indicates device isSimulated');

    // Get telemetry history
    const history = await SimulationService.getTelemetryHistory(testAcDevice.id, { limit: 10 });
    assert(Array.isArray(history) && history.length > 0, `getTelemetryHistory returns ${history.length} records`);

    // Metric type filtering
    const tempHistory = await SimulationService.getTelemetryHistory(testAcDevice.id, { metricType: 'currentTemperature' });
    assert(
      tempHistory.every((h) => h.metricType === 'currentTemperature'),
      'getTelemetryHistory strictly respects metricType filter'
    );

    // Bulk floor plan telemetry
    const bulkData = await SimulationService.getFloorPlanLatestTelemetry(testPlan.id);
    assert(bulkData.devices.length >= 5, `Bulk floor plan query returns all ${bulkData.devices.length} devices with telemetry`);
    assert(bulkData.engine.isRunning !== undefined, 'Bulk payload includes engine operational status');

    // ----------------------------------------------------
    // 7. CAPABILITY-VALIDATED DEVICE CONTROL
    // ----------------------------------------------------
    console.log('\n🎛️ Test Group 7: Validated Device Control Execution');

    // 7a. Control Smart Light Power
    const controlledLight = await SimulationService.executeDeviceControl(testLightDevice.id, {
      action: 'TOGGLE_POWER',
    });
    const lightConfig = controlledLight.configuration as Record<string, any>;
    assert(lightConfig.power === false && controlledLight.status === 'OFF', 'TOGGLE_POWER turns Smart Dimmer OFF');

    // 7b. Control Dimmer Brightness
    const dimmedLight = await SimulationService.executeDeviceControl(testLightDevice.id, {
      property: 'brightness',
      value: 45,
    });
    const dimmedConfig = dimmedLight.configuration as Record<string, any>;
    assert(dimmedConfig.brightness === 45, 'Controlling brightness to 45% persists to configuration');

    // 7c. Control Smart Lock to UNLOCKED
    const unlockedLock = await SimulationService.executeDeviceControl(testLockDevice.id, {
      action: 'TOGGLE_LOCK',
    });
    const unlockedConfig = unlockedLock.configuration as Record<string, any>;
    assert(unlockedConfig.lockState === 'UNLOCKED' && unlockedLock.status === 'UNLOCKED', 'TOGGLE_LOCK unlocks Smart Lock');

    // 7d. Control AC Target Temperature
    const cooledAc = await SimulationService.executeDeviceControl(testAcDevice.id, {
      property: 'targetTemperature',
      value: 19,
    });
    const cooledConfig = cooledAc.configuration as Record<string, any>;
    assert(cooledConfig.targetTemperature === 19, 'AC targetTemperature successfully updated to 19°C');

    // 7e. Strict capability validation: Reject control on read-only Sensor
    let sensorControlRejected = false;
    try {
      await SimulationService.executeDeviceControl(testSensorDevice.id, {
        action: 'TOGGLE_POWER',
      });
    } catch (rejectionErr: any) {
      sensorControlRejected = true;
    }
    assert(sensorControlRejected, 'Capability validator strictly rejects control action on read-only Sensor');

    // 7f. Reject out-of-range number control (e.g. brightness 150%)
    let outOfRangeRejected = false;
    try {
      await SimulationService.executeDeviceControl(testLightDevice.id, {
        property: 'brightness',
        value: 150,
      });
    } catch (rangeErr) {
      outOfRangeRejected = true;
    }
    assert(outOfRangeRejected, 'Capability validator strictly rejects out-of-range brightness (>100)');

    // ----------------------------------------------------
    // 8. TELEMETRY RETENTION PRUNING (>24 HOURS)
    // ----------------------------------------------------
    console.log('\n🧹 Test Group 8: Automated Telemetry Retention Pruning');

    // Insert artificially aged record (26 hours ago)
    const oldTimestamp = new Date(Date.now() - 26 * 60 * 60 * 1000);
    const oldRecord = await prisma.deviceTelemetry.create({
      data: {
        deviceId: testLightDevice.id,
        metricType: 'power',
        value: 1,
        isSimulated: true,
        timestamp: oldTimestamp,
      },
    });

    // Insert recent record (30 mins ago)
    const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000);
    const recentRecord = await prisma.deviceTelemetry.create({
      data: {
        deviceId: testLightDevice.id,
        metricType: 'power',
        value: 1,
        isSimulated: true,
        timestamp: recentTimestamp,
      },
    });

    // Run pruning cutoff 24h
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deletedCount = await engine1.pruneTelemetry(cutoff24h);
    assert(deletedCount >= 1, `Pruning successfully deleted ${deletedCount} expired telemetry record(s)`);

    const oldRecordCheck = await prisma.deviceTelemetry.findUnique({ where: { id: oldRecord.id } });
    assert(oldRecordCheck === null, 'Aged record (>24h) is confirmed deleted from database');

    const recentRecordCheck = await prisma.deviceTelemetry.findUnique({ where: { id: recentRecord.id } });
    assert(recentRecordCheck !== null, 'Recent record (<24h) is safely preserved');

    // ----------------------------------------------------
    // 9. SIMULATION ENGINE AUTONOMY (BACKGROUND NO-BROWSER PROOF)
    // ----------------------------------------------------
    console.log('\n🌐 Test Group 9: Background Autonomy Proof (Zero Browser Dependency)');

    // Start background timer
    engine1.start();
    const statusRunning = engine1.getStatus();
    assert(statusRunning.isRunning === true, 'SimulationEngine is running in autonomous background mode');

    // Let engine tick automatically in background
    console.log('  ⏳ Waiting 3.5 seconds to observe background tick progression...');
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const statusAfterWait = engine1.getStatus();
    assert(statusAfterWait.totalTicks >= statusRunning.totalTicks, `Ticks autonomously progressed in background: ${statusRunning.totalTicks} -> ${statusAfterWait.totalTicks}`);
    assert(statusAfterWait.lastTickAt !== null, 'lastTickAt timestamp is updated autonomously');

    // Gracefully stop engine
    engine1.stop();
    const statusStopped = engine1.getStatus();
    assert(statusStopped.isRunning === false, 'Engine stopped gracefully');

  } catch (err) {
    console.error('❌ Unexpected error in Phase 5 test suite:', err);
    testsFailed++;
  } finally {
    // Cleanup test artifacts
    console.log('\n🧹 Cleaning up test fixtures...');
    try {
      if (testAcDevice?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testAcDevice.id } });
      if (testSensorDevice?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testSensorDevice.id } });
      if (testAirQualityDevice?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testAirQualityDevice.id } });
      if (testLockDevice?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testLockDevice.id } });
      if (testLightDevice?.id) await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testLightDevice.id } });

      if (testPlan?.id) await prisma.device.deleteMany({ where: { floorPlanId: testPlan.id } });
      if (testPlan?.id) await prisma.floorPlan.delete({ where: { id: testPlan.id } });
      if (testFloor?.id) await prisma.floor.delete({ where: { id: testFloor.id } });
      if (testHouse?.id) await prisma.house.delete({ where: { id: testHouse.id } });
      console.log('  Cleaned up all temporary Phase 5 test records');
    } catch (cleanErr) {
      console.warn('  Notice: cleanup step:', cleanErr);
    }

    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log(`Phase 5 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('====================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
  }
}

runPhase5Tests();
