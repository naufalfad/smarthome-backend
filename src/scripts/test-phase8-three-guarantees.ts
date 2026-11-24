/**
 * PHASE 8: THREE SPECIFIC GUARANTEES VERIFICATION TEST
 * 
 * Specifically validates:
 * 1. Dashboard strictly reads backend database data (no dummy/hardcoded fallback values).
 * 2. Device control works and is consistent with the backend simulation engine.
 * 3. Monitoring operations strictly preserve Admin floor plan configuration (zero coordinate/spatial mutation).
 */

import { PrismaClient } from '@prisma/client';
import { DashboardService } from '../services/dashboard.service.js';
import { DeviceManagementService } from '../services/device-management.service.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import { VirtualDeviceProvider } from '../providers/virtual/virtual-device.provider.js';
import { SimulationEngine } from '../simulation/simulation.engine.js';
import {
  SmartLightProcessor,
  SmartAcProcessor,
} from '../simulation/simulation.device-processor.js';

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

async function runGuaranteesTest() {
  console.log('================================================================');
  console.log('🧪 VERIFIKASI KHUSUS 3 JAMINAN UTAMA PHASE 8');
  console.log('================================================================\n');

  // Initialize Provider Registry & Virtual Device Provider
  const registry = DeviceProviderRegistry.getInstance();
  const virtualProvider = new VirtualDeviceProvider();
  registry.registerProvider(virtualProvider);
  await registry.initializeAll();

  const simEngine = SimulationEngine.getInstance();

  // 1. Setup Test Fixture
  const testHouse = await prisma.house.create({
    data: {
      name: 'Rumah Verifikasi Jaminan Phase 8',
      clientName: 'Ibu Ratna',
      publishStatus: 'PUBLISHED',
    },
  });

  const testFloor = await prisma.floor.create({
    data: {
      houseId: testHouse.id,
      name: 'Lantai 1 Utama',
      levelNumber: 1,
    },
  });

  const originalPlanConfig = {
    imagePath: 'uploads/floor-plans/test-guarantee-plan.svg',
    imageWidth: 1600,
    imageHeight: 1000,
    viewBoxWidth: 1600,
    viewBoxHeight: 1000,
  };

  const testPlan = await prisma.floorPlan.create({
    data: {
      floorId: testFloor.id,
      name: 'Denah Arsitektur Lantai 1',
      ...originalPlanConfig,
    },
  });

  const originalRoomPolygon = [
    { x: 120, y: 150 },
    { x: 650, y: 150 },
    { x: 650, y: 600 },
    { x: 120, y: 600 },
  ];

  const testRoom = await prisma.room.create({
    data: {
      floorId: testFloor.id,
      name: 'Ruang Keluarga',
      type: 'LIVING_ROOM',
      floor: 1,
      color: '#8B5CF6',
      polygonCoordinates: originalRoomPolygon,
    },
  });

  // Create Smart Light
  const originalLightCoords = {
    x: 320.5,
    y: 280.0,
    normalizedX: 0.2003125,
    normalizedY: 0.28,
    rotation: 45.0,
    iconWidth: 48.0,
    iconHeight: 48.0,
  };

  const testLight = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testPlan.id,
      roomId: testRoom.id,
      name: 'Lampu Utama Ruang Keluarga',
      type: 'SMART_LIGHT',
      status: 'OFF',
      configuration: { power: false, brightness: 75 },
      ...originalLightCoords,
    },
  });

  // Create Smart AC
  const testAC = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testPlan.id,
      roomId: testRoom.id,
      name: 'AC Ruang Keluarga',
      type: 'SMART_AC',
      status: 'OFF',
      configuration: {
        power: false,
        targetTemperature: 22.0,
        currentTemperature: 29.0,
        mode: 'COOL',
        fanSpeed: 'AUTO',
      },
      x: 500,
      y: 200,
      normalizedX: 0.3125,
      normalizedY: 0.2,
    },
  });

  // Create Temp Sensor
  const testSensor = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testPlan.id,
      roomId: testRoom.id,
      name: 'Sensor Suhu Lingkungan',
      type: 'TEMP_HUMIDITY_SENSOR',
      status: 'ONLINE',
      configuration: { temperature: 26.4, humidity: 60.0 },
      x: 350,
      y: 350,
      normalizedX: 0.21875,
      normalizedY: 0.35,
    },
  });

  // ================================================================
  // JAMINAN 1: DASHBOARD MEMBACA DATA BACKEND, BUKAN DATA DUMMY
  // ================================================================
  console.log('----------------------------------------------------------------');
  console.log('📌 JAMINAN 1: Verifikasi Dashboard Membaca Data Aktual Backend');
  console.log('----------------------------------------------------------------');

  // 1A. Kondisi Awal: Belum ada record di device_telemetry
  const initialOverview = await DashboardService.getOverview(testHouse.id);
  assert(
    initialOverview.environmental.temperature.value === null,
    'Tanpa telemetry di DB, nilai suhu adalah NULL (TIDAK ADA data tiruan/dummy)'
  );
  assert(
    initialOverview.environmental.temperature.status === 'UNAVAILABLE',
    'Status sensor adalah UNAVAILABLE ketika belum ada telemetry aktual'
  );
  assert(
    initialOverview.environmental.aqi.value === null && initialOverview.environmental.aqi.status === 'UNAVAILABLE',
    'Sensor AQI yang belum dipasang berstatus UNAVAILABLE secara transparan'
  );

  // 1B. Masukkan data telemetri aktual ke PostgreSQL
  const simulatedTemp = 23.8;
  const simulatedHum = 58.5;
  const recordedAt = new Date();

  await prisma.deviceTelemetry.create({
    data: {
      deviceId: testSensor.id,
      metricType: 'temperature',
      value: simulatedTemp,
      unit: '°C',
      timestamp: recordedAt,
      isSimulated: true,
      providerType: 'VIRTUAL',
    },
  });

  await prisma.deviceTelemetry.create({
    data: {
      deviceId: testSensor.id,
      metricType: 'humidity',
      value: simulatedHum,
      unit: '%',
      timestamp: recordedAt,
      isSimulated: true,
      providerType: 'VIRTUAL',
    },
  });

  // 1C. Panggil DashboardService.getOverview dan validasi kesesuaian nilai
  const updatedOverview = await DashboardService.getOverview(testHouse.id);
  assert(
    updatedOverview.environmental.temperature.value === simulatedTemp,
    `Dashboard langsung membaca nilai suhu aktual DB: ${simulatedTemp}°C`
  );
  assert(
    updatedOverview.environmental.humidity.value === simulatedHum,
    `Dashboard langsung membaca nilai kelembapan aktual DB: ${simulatedHum}%`
  );
  assert(
    updatedOverview.environmental.temperature.status === 'NORMAL',
    'Suhu 23.8°C dievaluasi secara dinamis ke status NORMAL (ambang 18°C - 28°C)'
  );
  assert(
    updatedOverview.environmental.temperature.deviceName === 'Sensor Suhu Lingkungan',
    'Metadata nama perangkat sensor diambil secara relasional dari tabel devices'
  );

  // 1D. Uji Rumah Kosong (Zero Mocking)
  const emptyHouse = await prisma.house.create({
    data: { name: 'Rumah Kosong Tanpa Perangkat', publishStatus: 'DRAFT' },
  });
  const emptyOverview = await DashboardService.getOverview(emptyHouse.id);
  assert(emptyOverview.houseSummary.totalFloors === 0, 'Rumah kosong: totalFloors = 0');
  assert(emptyOverview.houseSummary.totalDevices === 0, 'Rumah kosong: totalDevices = 0');
  assert(emptyOverview.environmental.temperature.value === null, 'Rumah kosong: tidak mengarang nilai suhu');
  assert(emptyOverview.environmental.humidity.value === null, 'Rumah kosong: tidak mengarang nilai kelembapan');

  // ================================================================
  // JAMINAN 2: KONTROL PERANGKAT KONSISTEN DENGAN SIMULASI BACKEND
  // ================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('📌 JAMINAN 2: Verifikasi Kontrol Konsisten dengan Simulasi Backend');
  console.log('----------------------------------------------------------------');

  // 2A. Kontrol Lampu via DashboardService -> DeviceManagementService -> VirtualDeviceProvider
  const lightCmdResult = await DashboardService.controlDevice(testLight.id, 'SET_POWER', {
    power: true,
    status: 'ON',
  });
  assert(lightCmdResult.status === 'SUCCESS', 'Perintah SET_POWER pada Lampu mengembalikan status SUCCESS');

  // Verifikasi ke database: status lampu harus ON
  const lightInDb = await prisma.device.findUnique({ where: { id: testLight.id } });
  assert(lightInDb?.status === 'ON', 'Database perangkat mengonfirmasi status Lampu telah menjadi ON');
  const lightConfig = lightInDb?.configuration as any;
  assert(lightConfig?.power === true, 'Konfigurasi runtime power bernilai true');

  // Verifikasi audit DeviceCommand tercatat di database
  const lightAudit = await prisma.deviceCommand.findFirst({
    where: { deviceId: testLight.id, commandType: 'SET_POWER' },
    orderBy: { createdAt: 'desc' },
  });
  assert(lightAudit !== null, 'Riwayat DeviceCommand tercatat di database');
  assert(lightAudit?.status === 'SUCCESS', 'Status riwayat DeviceCommand bernilai SUCCESS');

  // Jalankan simulation tick untuk memvalidasi bahwa simulasi backend menghormati status ON ini
  const lightProcessor = new SmartLightProcessor();
  const lightTickResult = await lightProcessor.processTick(lightInDb, { tickNumber: 1, timestamp: new Date(), allDevices: [lightInDb] });
  assert(lightTickResult !== null && lightTickResult.status === 'ON', 'Simulasi backend mempertahankan status Lampu tetap ON saat tick berjalan');

  // 2B. Kontrol Smart AC: Nyalakan dan set suhu ke 20°C
  await DashboardService.controlDevice(testAC.id, 'SET_POWER', { power: true, status: 'ON' });
  await DashboardService.controlDevice(testAC.id, 'SET_TEMPERATURE', { temperature: 20.0 });

  const acInDb = await prisma.device.findUnique({ where: { id: testAC.id } });
  const acConfig = acInDb?.configuration as any;
  assert(acInDb?.status === 'ON', 'Smart AC berhasil dinyalakan (ON)');
  assert(acConfig?.targetTemperature === 20.0, 'Target temperatur Smart AC tersimpan 20.0°C');

  // Jalankan simulasi konvergensi temperatur AC
  const acProcessor = new SmartAcProcessor();
  const acTick1 = await acProcessor.processTick(acInDb, { tickNumber: 1, timestamp: new Date(), allDevices: [acInDb] });
  assert(
    acTick1 !== null && (acTick1.configuration as any).currentTemperature < 29.0,
    `Simulasi AC COOL aktif: suhu mendingin dari 29.0°C menjadi ${(acTick1?.configuration as any).currentTemperature}°C menuju target 20.0°C`
  );

  // 2C. Proteksi Sensor Read-Only (Safety Guard)
  let sensorControlBlocked = false;
  try {
    await DashboardService.controlDevice(testSensor.id, 'SET_CONFIG', { temperature: 35.0 });
  } catch (err: any) {
    sensorControlBlocked = true;
    assert(
      err.message.includes('read-only') || err.message.includes('tidak dapat dikontrol'),
      'Perintah manipulasi sensor suhu ditolak oleh capability guard dengan pesan read-only'
    );
  }
  assert(sensorControlBlocked, 'Sensor suhu lingkungan terlindungi secara ketat dari kontrol eksternal');

  // ================================================================
  // JAMINAN 3: MONITORING TIDAK MENGGANGGU/MERUSAK KONFIGURASI ADMIN
  // ================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('📌 JAMINAN 3: Verifikasi Monitoring Bersifat Non-Destruktif');
  console.log('----------------------------------------------------------------');

  // 3A. Jalankan seluruh alur pembacaan monitoring berulang kali
  await DashboardService.getOverview(testHouse.id);
  await DashboardService.getFloors(testHouse.id);
  await DashboardService.getRooms(testHouse.id, testFloor.id);
  await DashboardService.getDevices(testHouse.id, testFloor.id);
  await DashboardService.getActivities(testHouse.id, 50);
  await DashboardService.getAutomationSummary(testHouse.id);

  // 3B. Verifikasi Koordinat Perangkat Setelah Monitoring & Kontrol
  const finalLight = await prisma.device.findUnique({ where: { id: testLight.id } });
  assert(finalLight !== null, 'Perangkat Lampu tetap ada di database');
  assert(finalLight?.x === originalLightCoords.x, `Koordinat X tetap persis ${originalLightCoords.x}`);
  assert(finalLight?.y === originalLightCoords.y, `Koordinat Y tetap persis ${originalLightCoords.y}`);
  assert(
    finalLight?.normalizedX === originalLightCoords.normalizedX,
    `Normalized X tetap persis ${originalLightCoords.normalizedX}`
  );
  assert(
    finalLight?.normalizedY === originalLightCoords.normalizedY,
    `Normalized Y tetap persis ${originalLightCoords.normalizedY}`
  );
  assert(finalLight?.rotation === originalLightCoords.rotation, `Rotasi tetap persis ${originalLightCoords.rotation}°`);
  assert(finalLight?.iconWidth === originalLightCoords.iconWidth, `Lebar icon tetap ${originalLightCoords.iconWidth}`);
  assert(finalLight?.iconHeight === originalLightCoords.iconHeight, `Tinggi icon tetap ${originalLightCoords.iconHeight}`);

  // 3C. Verifikasi Struktur Denah & Poligon Ruangan Admin
  const finalPlan = await prisma.floorPlan.findUnique({ where: { id: testPlan.id } });
  assert(finalPlan?.imagePath === originalPlanConfig.imagePath, 'File gambar denah tidak berubah');
  assert(finalPlan?.imageWidth === originalPlanConfig.imageWidth, 'Dimensi lebar denah tidak berubah');
  assert(finalPlan?.imageHeight === originalPlanConfig.imageHeight, 'Dimensi tinggi denah tidak berubah');

  const finalRoom = await prisma.room.findUnique({ where: { id: testRoom.id } });
  const finalPolygon = finalRoom?.polygonCoordinates as any[];
  assert(
    JSON.stringify(finalPolygon) === JSON.stringify(originalRoomPolygon),
    'Titik-titik poligon ruangan yang digambar Admin tetap 100% identik tanpa pergeseran'
  );

  // Clean up
  console.log('\n🧹 Membersihkan data uji verifikasi...');
  await prisma.deviceTelemetry.deleteMany({ where: { deviceId: testSensor.id } });
  await prisma.deviceCommand.deleteMany({ where: { deviceId: { in: [testLight.id, testAC.id] } } });
  await prisma.device.deleteMany({ where: { houseId: { in: [testHouse.id, emptyHouse.id] } } });
  await prisma.room.deleteMany({ where: { floorId: testFloor.id } });
  await prisma.floorPlan.deleteMany({ where: { floorId: testFloor.id } });
  await prisma.floor.deleteMany({ where: { houseId: { in: [testHouse.id, emptyHouse.id] } } });
  await prisma.house.deleteMany({ where: { id: { in: [testHouse.id, emptyHouse.id] } } });

  console.log('\n================================================================');
  console.log(`🎉 HASIL VERIFIKASI: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runGuaranteesTest()
  .catch((e) => {
    console.error('Fatal error during guarantees verification:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
