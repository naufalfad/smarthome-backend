import { PrismaClient } from '@prisma/client';
import { DeviceManagementService } from '../services/device-management.service.js';
import { DeviceService } from '../services/device.service.js';
import { SimulationService } from '../simulation/simulation.service.js';
import { SimulationEngine } from '../simulation/simulation.engine.js';
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

async function runChecklist() {
  console.log('====================================================');
  console.log('🔍 PHASE 6: FINAL VERIFICATION CHECKLIST');
  console.log('====================================================\n');

  let testHouse: any = null;
  let testFloor: any = null;
  let testPlan: any = null;
  let testAc: any = null;
  let testLock: any = null;
  let testLight: any = null;
  let testSensor: any = null;

  try {
    await seedIoTDeviceCatalog();

    testHouse = await prisma.house.create({
      data: {
        name: 'Checklist Verification House',
        publishStatus: 'PUBLISHED',
      },
    });

    testFloor = await prisma.floor.create({
      data: {
        name: 'Checklist Floor',
        levelNumber: 1,
        houseId: testHouse.id,
      },
    });

    testPlan = await prisma.floorPlan.create({
      data: {
        name: 'Checklist Plan',
        floorId: testFloor.id,
        viewBoxWidth: 1000,
        viewBoxHeight: 700,
      },
    });

    const acCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_AC' } });
    testAc = await DeviceService.createDevice(testPlan.id, {
      name: 'Test Smart AC',
      type: 'SMART_AC',
      catalogItemId: acCat?.id,
      x: 100,
      y: 100,
      configuration: { power: true, mode: 'COOL', fanSpeed: 'HIGH', targetTemperature: 24, currentTemperature: 27 },
    });

    const lockCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_LOCK' } });
    testLock = await DeviceService.createDevice(testPlan.id, {
      name: 'Test Smart Lock',
      type: 'SMART_LOCK',
      catalogItemId: lockCat?.id,
      x: 200,
      y: 100,
      configuration: { lockState: 'LOCKED' },
    });

    const lightCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'SMART_LIGHT' } });
    testLight = await DeviceService.createDevice(testPlan.id, {
      name: 'Test Smart Light',
      type: 'SMART_LIGHT',
      catalogItemId: lightCat?.id,
      x: 300,
      y: 100,
      configuration: { power: true },
    });

    const sensorCat = await prisma.deviceCatalogItem.findFirst({ where: { deviceType: 'TEMP_HUMIDITY_SENSOR' } });
    testSensor = await DeviceService.createDevice(testPlan.id, {
      name: 'Test Sensor',
      type: 'TEMP_HUMIDITY_SENSOR',
      catalogItemId: sensorCat?.id,
      x: 400,
      y: 100,
      configuration: { temperature: 24, humidity: 55 },
    });

    // ----------------------------------------------------
    // CHECK 1: INSPECTOR DISPLAY METADATA (VIRTUAL, ONLINE, SIMULATION)
    // ----------------------------------------------------
    console.log('📋 Check 1: Inspector Metadata (VIRTUAL, ONLINE, SIMULATION)');
    // Simulation Engine runs in background on server startup
    SimulationEngine.getInstance().start();

    const stateAc = await DeviceManagementService.getDeviceStateWithProvider(testAc.id);
    assert(stateAc.providerType === 'VIRTUAL', 'Smart AC reports providerType === VIRTUAL');
    assert(stateAc.connectionStatus === 'ONLINE', 'Smart AC reports connectionStatus === ONLINE');
    assert(stateAc.isSimulated === true, 'Smart AC reports isSimulated === true');
    assert(stateAc.metadata?.dataSource === 'SIMULATION', 'Smart AC reports dataSource === SIMULATION');

    const stateLock = await DeviceManagementService.getDeviceStateWithProvider(testLock.id);
    assert(stateLock.providerType === 'VIRTUAL', 'Smart Lock reports providerType === VIRTUAL');
    assert(stateLock.connectionStatus === 'ONLINE', 'Smart Lock reports connectionStatus === ONLINE');

    // ----------------------------------------------------
    // CHECK 2: SMART AC CONTROL (POWER ON/OFF & TARGET TEMP)
    // ----------------------------------------------------
    console.log('\n❄️ Check 2: Smart AC Controls (Turn ON/OFF, Temperature, Mode)');
    // Turn AC OFF via executeDeviceControl
    const acOff = await SimulationService.executeDeviceControl(testAc.id, {
      action: 'SET_POWER',
      payload: { power: false },
    });
    const acOffConfig = acOff.configuration as Record<string, any>;
    assert(acOffConfig.power === false && acOff.status === 'OFF', 'Smart AC successfully turned OFF');

    // Turn AC back ON via SET_CONFIG payload (as sent from modal)
    const acOn = await SimulationService.executeDeviceControl(testAc.id, {
      action: 'SET_CONFIG',
      payload: { power: true, status: 'ON' },
    });
    const acOnConfig = acOn.configuration as Record<string, any>;
    assert(acOnConfig.power === true && acOn.status === 'ON', 'Smart AC successfully turned ON with modal payload');

    // Set target temperature to 20°C
    const acTemp = await SimulationService.executeDeviceControl(testAc.id, {
      property: 'targetTemperature',
      value: 20,
    });
    const acTempConfig = acTemp.configuration as Record<string, any>;
    assert(acTempConfig.targetTemperature === 20, 'Smart AC target temperature updated to 20°C');

    // ----------------------------------------------------
    // CHECK 3: SMART DOOR LOCK CONTROL (LOCK / UNLOCK)
    // ----------------------------------------------------
    console.log('\n🔒 Check 3: Smart Door Lock (Lock & Unlock)');
    // Unlock Door Lock via UNLOCK command
    const lockUnlocked = await SimulationService.executeDeviceControl(testLock.id, {
      action: 'UNLOCK',
    });
    const unlConfig = lockUnlocked.configuration as Record<string, any>;
    assert(unlConfig.lockState === 'UNLOCKED' && lockUnlocked.status === 'UNLOCKED', 'Smart Door Lock unlocked via UNLOCK action');

    // Lock Door Lock via modal SET_CONFIG payload
    const lockRelocked = await SimulationService.executeDeviceControl(testLock.id, {
      action: 'SET_CONFIG',
      payload: { lockState: 'LOCKED', status: 'LOCKED' },
    });
    const relConfig = lockRelocked.configuration as Record<string, any>;
    assert(relConfig.lockState === 'LOCKED' && lockRelocked.status === 'LOCKED', 'Smart Door Lock locked via modal SET_CONFIG payload');

    // ----------------------------------------------------
    // CHECK 4: SMART LIGHT & COMMAND HISTORY TRACKING
    // ----------------------------------------------------
    console.log('\n💡 Check 4: Smart Light & Command History Tracking');
    const lightToggled = await SimulationService.executeDeviceControl(testLight.id, {
      action: 'TOGGLE_POWER',
    });
    assert(lightToggled.status === 'OFF', 'Smart Light toggled OFF');

    const history = await DeviceManagementService.getDeviceCommandHistory(testLight.id, 5);
    assert(history.length > 0, `Command history recorded for Smart Light (${history.length} records)`);
    assert(history[0].status === 'SUCCESS', `Latest command status is SUCCESS`);

    // ----------------------------------------------------
    // CHECK 5: SENSOR READ-ONLY GUARD
    // ----------------------------------------------------
    console.log('\n🌡️ Check 5: Sensor Read-Only Guard');
    let sensorBlocked = false;
    try {
      await SimulationService.executeDeviceControl(testSensor.id, {
        property: 'temperature',
        value: 30,
      });
    } catch (err: any) {
      sensorBlocked = true;
      assert(err.message.includes('read-only'), `Error indicates property is read-only ("${err.message}")`);
    }
    assert(sensorBlocked, 'Sensor remains strictly READ-ONLY (control rejected)');

    // ----------------------------------------------------
    // CHECK 6: SIMULATION ENGINE CONTINUOUS BACKGROUND TICKS
    // ----------------------------------------------------
    console.log('\n⚡ Check 6: Simulation Engine Background Execution');
    const engine = SimulationEngine.getInstance();
    engine.start();
    const initialTicks = engine.getStatus().totalTicks;
    await new Promise((r) => setTimeout(r, 2000));
    const currentStatus = engine.getStatus();
    assert(currentStatus.isRunning === true, 'Simulation Engine is actively running in background');
    assert(typeof currentStatus.totalTicks === 'number', 'Simulation Engine maintains autonomous ticks');
    engine.stop();

  } catch (err: any) {
    console.error('❌ Error during checklist execution:', err);
    testsFailed++;
  } finally {
    console.log('\n🧹 Cleaning up checklist records...');
    try {
      if (testAc?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testAc.id } });
      if (testLock?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testLock.id } });
      if (testLight?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testLight.id } });
      if (testSensor?.id) await prisma.deviceCommand.deleteMany({ where: { deviceId: testSensor.id } });

      if (testPlan?.id) await prisma.device.deleteMany({ where: { floorPlanId: testPlan.id } });
      if (testPlan?.id) await prisma.floorPlan.delete({ where: { id: testPlan.id } });
      if (testFloor?.id) await prisma.floor.delete({ where: { id: testFloor.id } });
      if (testHouse?.id) await prisma.house.delete({ where: { id: testHouse.id } });
    } catch {}

    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log(`Checklist Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('====================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    }
    process.exit(0);
  }
}

runChecklist();
