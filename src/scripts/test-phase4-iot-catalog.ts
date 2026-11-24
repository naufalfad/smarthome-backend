import { PrismaClient } from '@prisma/client';
import { DeviceCatalogService } from '../services/device-catalog.service.js';
import { DeviceService } from '../services/device.service.js';
import { seedIoTDeviceCatalog } from './seed-iot-catalog.js';
import {
  DeviceCapability,
  validateDeviceConfiguration,
  getCatalogDefinitionByType,
} from '../constants/device-capabilities.js';

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

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('🧪 PHASE 4: IOT DEVICE CATALOG & CAPABILITY TEST SUITE');
  console.log('====================================================\n');

  let testHouse: any = null;
  let testFloor: any = null;
  let testPlan: any = null;
  let placedLight: any = null;
  let placedAC: any = null;
  let placedSensor: any = null;

  try {
    // ----------------------------------------------------
    // 1. SEEDER IDEMPOTENCY & DATABASE PERSISTENCE
    // ----------------------------------------------------
    console.log('🌱 Test Group 1: Seeder Idempotency & Catalog Persistence');
    const seed1 = await seedIoTDeviceCatalog();
    assert(seed1.totalInDb >= 6, 'First seeder run populates at least 6 standard catalog items');

    const seed2 = await seedIoTDeviceCatalog();
    assert(seed2.createdCount === 0, 'Second seeder run creates 0 duplicates (Idempotent)');
    assert(seed2.totalInDb === seed1.totalInDb, 'Total catalog count remains unchanged after re-seed');

    // ----------------------------------------------------
    // 2. CATALOG SERVICE QUERIES & FILTERING
    // ----------------------------------------------------
    console.log('\n🔍 Test Group 2: Catalog Service Queries & Filtering');
    const allCatalog = await DeviceCatalogService.listCatalog();
    assert(allCatalog.length >= 6, `Catalog list returns ${allCatalog.length} active devices`);

    const lightingItems = await DeviceCatalogService.listCatalog({ category: 'LIGHTING' });
    assert(
      lightingItems.length >= 2 && lightingItems.every((d) => d.category === 'LIGHTING'),
      'Category filter LIGHTING returns only lighting devices (Smart Light & Smart Dimmer)'
    );

    const climateItems = await DeviceCatalogService.listCatalog({ category: 'CLIMATE' });
    assert(
      climateItems.length >= 1 && climateItems.some((d) => d.deviceType === 'SMART_AC'),
      'Category filter CLIMATE returns Smart AC'
    );

    const sensorItems = await DeviceCatalogService.listCatalog({ category: 'SENSORS' });
    assert(
      sensorItems.length >= 2 &&
        sensorItems.some((d) => d.deviceType === 'TEMP_HUMIDITY_SENSOR') &&
        sensorItems.some((d) => d.deviceType === 'AIR_QUALITY_SENSOR'),
      'Category filter SENSORS returns Temperature/Humidity & Air Quality sensors'
    );

    const searchResult = await DeviceCatalogService.listCatalog({ search: 'dimmer' });
    assert(
      searchResult.length >= 1 && searchResult[0].deviceType === 'SMART_DIMMER',
      'Search query "dimmer" accurately finds Smart Dimmer Light'
    );

    const lightCatalog = await DeviceCatalogService.getCatalogByType('SMART_LIGHT');
    assert(lightCatalog.name === 'Smart Light', 'getCatalogByType retrieves Smart Light');

    const byAlias = await DeviceCatalogService.getCatalogByType('LIGHT');
    assert(byAlias.deviceType === 'SMART_LIGHT', 'Legacy alias "LIGHT" resolves to canonical "SMART_LIGHT"');

    const byId = await DeviceCatalogService.getCatalogById(lightCatalog.id);
    assert(byId.id === lightCatalog.id, 'getCatalogById retrieves valid catalog item');

    // ----------------------------------------------------
    // 3. CAPABILITY DEFINITION & READ-ONLY SENSOR ENFORCEMENT
    // ----------------------------------------------------
    console.log('\n⚙️ Test Group 3: Capability Definitions & Read-Only Sensor Guard');
    const lightCaps = await DeviceCatalogService.getCapabilitiesByType('SMART_LIGHT');
    const powerCap = lightCaps.find((c) => c.property === 'power');
    const brightnessCap = lightCaps.find((c) => c.property === 'brightness');
    assert(
      Boolean(powerCap?.type === 'boolean' && powerCap.controllable === true),
      'Smart Light power is controllable boolean'
    );
    assert(
      Boolean(brightnessCap?.type === 'number' && brightnessCap.min === 0 && brightnessCap.max === 100),
      'Smart Light brightness is 0-100 percentage number'
    );

    const acCaps = await DeviceCatalogService.getCapabilitiesByType('SMART_AC');
    const modeCap = acCaps.find((c) => c.property === 'mode');
    const fanCap = acCaps.find((c) => c.property === 'fanSpeed');
    assert(
      Boolean(modeCap?.type === 'enum' && modeCap.options?.includes('COOL') && modeCap.options?.includes('HEAT')),
      'Smart AC mode is enum supporting COOL, HEAT, AUTO, FAN, DRY'
    );
    assert(
      Boolean(fanCap?.type === 'enum' && fanCap.options?.includes('AUTO') && fanCap.options?.includes('HIGH')),
      'Smart AC fan speed is enum supporting AUTO, LOW, MEDIUM, HIGH'
    );

    const sensorCaps = await DeviceCatalogService.getCapabilitiesByType('TEMP_HUMIDITY_SENSOR');
    const tempCap = sensorCaps.find((c) => c.property === 'temperature');
    const humCap = sensorCaps.find((c) => c.property === 'humidity');
    assert(Boolean(tempCap?.controllable === false), 'Sensor temperature is strictly READ-ONLY (controllable: false)');
    assert(Boolean(humCap?.controllable === false), 'Sensor humidity is strictly READ-ONLY (controllable: false)');
    assert(tempCap?.unit === '°C' && humCap?.unit === '%', 'Sensor capabilities define appropriate units (°C, %)');

    // ----------------------------------------------------
    // 4. CAPABILITY VALIDATION HELPER
    // ----------------------------------------------------
    console.log('\n🛡️ Test Group 4: Capability Configuration Validation Helper');
    // Valid AC config
    const validAC = validateDeviceConfiguration(acCaps, {
      power: true,
      targetTemperature: 22,
      mode: 'COOL',
      fanSpeed: 'HIGH',
    });
    assert(validAC.isValid === true, 'Valid AC configuration passes validation');

    // Invalid target temperature (out of 16-30 range)
    const invalidTemp = validateDeviceConfiguration(acCaps, { targetTemperature: 38 });
    assert(
      invalidTemp.isValid === false && invalidTemp.errors.some((e) => e.includes('maksimum 30')),
      'Rejects target temperature exceeding maximum 30°C'
    );

    // Invalid enum mode
    const invalidMode = validateDeviceConfiguration(acCaps, { mode: 'TURBO_FREEZE' });
    assert(
      invalidMode.isValid === false && invalidMode.errors.some((e) => e.includes('tidak valid')),
      'Rejects unsupported mode enum "TURBO_FREEZE"'
    );

    // Control attempt on read-only sensor property
    const attemptSensorControl = validateDeviceConfiguration(sensorCaps, { temperature: 18 }, true);
    assert(
      attemptSensorControl.isValid === false && attemptSensorControl.errors.some((e) => e.includes('read-only')),
      'Strictly blocks control action on read-only sensor property'
    );

    // ----------------------------------------------------
    // 5. DEVICE CREATION FROM CATALOG ON FLOOR PLAN
    // ----------------------------------------------------
    console.log('\n🏠 Test Group 5: Device Creation from Catalog on Floor Plan');
    // Setup temporary test house
    testHouse = await prisma.house.create({
      data: {
        name: 'Rumah Uji Fase 4',
        clientName: 'Ibu Sarah',
      },
    });

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
      },
    });

    // Place Smart Light from catalog
    placedLight = await DeviceService.createDevice(testPlan.id, {
      name: 'Lampu Meja Tamu',
      catalogItemId: lightCatalog.id,
      normalizedX: 0.3,
      normalizedY: 0.4,
      configuration: { brightness: 90 },
    });

    assert(placedLight.catalogItemId === lightCatalog.id, 'Placed light links to DeviceCatalogItem foreign key');
    assert(placedLight.type === 'SMART_LIGHT', 'Placed light inherits canonical deviceType from catalog');
    const lightConfig = (placedLight.configuration as any) || {};
    assert(lightConfig.brightness === 90, 'Custom brightness 90% persisted');
    assert(lightConfig.power === true, 'Default power true inherited from catalog');
    assert(placedLight.roomId === null, 'Room relation remains nullable');

    // Place Smart AC with custom configuration
    const acCatalog = await DeviceCatalogService.getCatalogByType('SMART_AC');
    placedAC = await DeviceService.createDevice(testPlan.id, {
      name: 'AC Ruang Tamu',
      catalogItemId: acCatalog.id,
      x: 800,
      y: 300,
      configuration: {
        targetTemperature: 21,
        mode: 'COOL',
        fanSpeed: 'MEDIUM',
      },
    });

    const acConfig = (placedAC.configuration as any) || {};
    assert(acConfig.targetTemperature === 21, 'Smart AC targetTemperature 21°C persisted');
    assert(acConfig.fanSpeed === 'MEDIUM', 'Smart AC fanSpeed MEDIUM persisted');

    // Place Temperature Sensor
    const sensorCatalog = await DeviceCatalogService.getCatalogByType('TEMP_HUMIDITY_SENSOR');
    placedSensor = await DeviceService.createDevice(testPlan.id, {
      name: 'Sensor Suhu Ruang Tamu',
      catalogItemId: sensorCatalog.id,
      normalizedX: 0.5,
      normalizedY: 0.5,
    });

    const sensorConfig = (placedSensor.configuration as any) || {};
    assert(sensorConfig.temperature === 25.5, 'Sensor default temperature 25.5°C loaded from catalog');
    assert(sensorConfig.humidity === 58, 'Sensor default humidity 58% loaded from catalog');

    // ----------------------------------------------------
    // 6. BACKEND CONFIGURATION UPDATE & VALIDATION
    // ----------------------------------------------------
    console.log('\n🔧 Test Group 6: Backend Configuration Update & Capability Enforcement');
    // Update AC configuration via updateDeviceConfiguration
    const updatedAC = await DeviceService.updateDeviceConfiguration(placedAC.id, {
      targetTemperature: 25,
      fanSpeed: 'HIGH',
    });
    const updatedACConfig = (updatedAC.configuration as Record<string, any>) || {};
    assert(updatedACConfig.targetTemperature === 25, 'AC targetTemperature successfully updated to 25°C');
    assert(updatedACConfig.fanSpeed === 'HIGH', 'AC fanSpeed successfully updated to HIGH');

    // Attempt invalid AC configuration update (temp 45) -> Should throw
    let acUpdateThrew = false;
    try {
      await DeviceService.updateDeviceConfiguration(placedAC.id, { targetTemperature: 45 });
    } catch (err: any) {
      acUpdateThrew = true;
    }
    assert(acUpdateThrew, 'updateDeviceConfiguration rejects targetTemperature outside valid range');

    // Attempt control update on sensor -> Should throw
    let sensorControlThrew = false;
    try {
      await DeviceService.updateDeviceConfiguration(placedSensor.id, { temperature: 30 }, true);
    } catch (err: any) {
      sensorControlThrew = true;
    }
    assert(sensorControlThrew, 'updateDeviceConfiguration rejects control action on read-only sensor');

    // ----------------------------------------------------
    // 7. FLOOR PLAN OWNERSHIP & DATA INTEGRITY
    // ----------------------------------------------------
    console.log('\n🔒 Test Group 7: Floor Plan Ownership & Data Integrity');
    // Invalid floor plan creation attempt -> Should throw
    let invalidPlanThrew = false;
    try {
      await DeviceService.createDevice('non-existent-plan-id', {
        name: 'Ghost Device',
        type: 'LIGHT',
      });
    } catch (err: any) {
      invalidPlanThrew = true;
    }
    assert(invalidPlanThrew, 'createDevice rejects non-existent floorPlanId');

    // Delete device instance
    await DeviceService.deleteDevice(placedLight.id);
    const catalogAfterDeviceDelete = await DeviceCatalogService.getCatalogById(lightCatalog.id);
    assert(!!catalogAfterDeviceDelete, 'Deleting device instance does NOT delete or affect catalog item');

  } catch (err) {
    console.error('Fatal test error:', err);
    testsFailed++;
  } finally {
    // ----------------------------------------------------
    // 8. CLEANUP TEST DATA
    // ----------------------------------------------------
    console.log('\n🧹 Test Group 8: Selective Test Data Cleanup');
    if (testHouse) {
      await prisma.device.deleteMany({ where: { houseId: testHouse.id } });
      await prisma.floorPlan.deleteMany({ where: { floor: { houseId: testHouse.id } } });
      await prisma.floor.deleteMany({ where: { houseId: testHouse.id } });
      await prisma.house.delete({ where: { id: testHouse.id } });
      console.log('  ✅ Test house and associated test devices cleaned up safely');
    }
  }

  console.log('\n====================================================');
  console.log(`📊 PHASE 4 TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('====================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runPhase4Tests()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
