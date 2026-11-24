/**
 * SCRIPT PERSIAPAN DATA PENGUJIAN MANUAL PHASE 4
 *
 * Menyiapkan akun dan data properti persis sesuai skenario pengujian:
 * 1. Admin (SUPER_ADMIN) -> admin / admin123
 * 2. Customer A (CUSTOMER) -> customer.a@smarthome.id (atau customer_a) / customer123 -> Memiliki Rumah A1 (ACTIVE) dan Rumah A2 (CONFIGURING)
 * 3. Customer B (CUSTOMER) -> customer.b@smarthome.id (atau customer_b) / customer123 -> Memiliki Rumah B1 (ACTIVE)
 * 4. Technician X (TECHNICIAN) -> technician.x@smarthome.id (atau tech_x) / tech123 -> Belum ada assignment
 * 5. Technician Y (TECHNICIAN) -> technician.y@smarthome.id (atau tech_y) / tech123 -> Belum ada assignment
 * 6. Legacy Property -> Properti tanpa customerId (customerId = null) untuk pengujian akses Super Admin ke rumah unassigned.
 */

import { prisma } from '../services/db.service.js';
import { hashPassword } from '../utils/auth-crypto.util.js';
import { AutomationService } from '../automation/automation.service.js';

export async function setupManualTestData() {
  console.log('===================================================================');
  console.log('🛠️  MENYIAPKAN DATA PENGUJIAN MANUAL PHASE 4');
  console.log('===================================================================\n');

  // 1. Super Admin
  let admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        username: 'admin',
        name: 'Super Administrator',
        email: 'admin@smarthome.id',
        role: 'SUPER_ADMIN',
        isActive: true,
        password: hashPassword('admin123'),
      },
    });
    console.log(`✅ [SUPER_ADMIN] Akun admin dibuat: 'admin' (ID: ${admin.id})`);
  } else {
    console.log(`✅ [SUPER_ADMIN] Akun admin ada: '${admin.username || admin.email}' (ID: ${admin.id})`);
  }

  // 2. Customer A (customer.a@smarthome.id / customer123)
  let custA = await prisma.user.findFirst({
    where: {
      OR: [{ email: 'customer.a@smarthome.id' }, { username: 'customer_a' }],
    },
    include: { customerProfile: true },
  });

  if (!custA) {
    custA = await prisma.user.create({
      data: {
        username: 'customer_a',
        email: 'customer.a@smarthome.id',
        name: 'Customer A - Budi Santoso',
        role: 'CUSTOMER',
        isActive: true,
        password: hashPassword('customer123'),
        customerProfile: {
          create: {
            fullName: 'Budi Santoso (Customer A)',
            phone: '081234567890',
            billingAddress: 'Jl. Merdeka No. 10, Jakarta Selatan',
          },
        },
      },
      include: { customerProfile: true },
    });
    console.log(`✅ [CUSTOMER] Customer A dibuat: ${custA.email} / customer123 (Profile ID: ${custA.customerProfile!.id})`);
  } else {
    if (!custA.customerProfile) {
      await prisma.customerProfile.create({
        data: {
          userId: custA.id,
          fullName: custA.name || 'Customer A',
        },
      });
      custA = await prisma.user.findUnique({ where: { id: custA.id }, include: { customerProfile: true } }) as any;
    }
    console.log(`✅ [CUSTOMER] Customer A siap: ${custA!.email || custA!.username} (Profile ID: ${custA!.customerProfile!.id})`);
  }

  // 3. Customer B (customer.b@smarthome.id / customer123)
  let custB = await prisma.user.findFirst({
    where: {
      OR: [{ email: 'customer.b@smarthome.id' }, { username: 'customer_b' }],
    },
    include: { customerProfile: true },
  });

  if (!custB) {
    custB = await prisma.user.create({
      data: {
        username: 'customer_b',
        email: 'customer.b@smarthome.id',
        name: 'Customer B - Siti Rahma',
        role: 'CUSTOMER',
        isActive: true,
        password: hashPassword('customer123'),
        customerProfile: {
          create: {
            fullName: 'Siti Rahma (Customer B)',
            phone: '081987654321',
            billingAddress: 'Jl. Sudirman No. 45, Jakarta Pusat',
          },
        },
      },
      include: { customerProfile: true },
    });
    console.log(`✅ [CUSTOMER] Customer B dibuat: ${custB.email} / customer123 (Profile ID: ${custB.customerProfile!.id})`);
  } else {
    if (!custB.customerProfile) {
      await prisma.customerProfile.create({
        data: {
          userId: custB.id,
          fullName: custB.name || 'Customer B',
        },
      });
      custB = await prisma.user.findUnique({ where: { id: custB.id }, include: { customerProfile: true } }) as any;
    }
    console.log(`✅ [CUSTOMER] Customer B siap: ${custB!.email || custB!.username} (Profile ID: ${custB!.customerProfile!.id})`);
  }

  // 4. Technician X (technician.x@smarthome.id / tech123)
  let techX = await prisma.user.findFirst({
    where: {
      OR: [{ email: 'technician.x@smarthome.id' }, { username: 'tech_x' }],
    },
    include: { technicianProfile: true },
  });

  if (!techX) {
    techX = await prisma.user.create({
      data: {
        username: 'tech_x',
        email: 'technician.x@smarthome.id',
        name: 'Technician X - Eko Prasetyo',
        role: 'TECHNICIAN',
        isActive: true,
        password: hashPassword('tech123'),
        technicianProfile: {
          create: {
            employeeCode: 'TECH-X-01',
            specialization: 'IoT Hardware & Electrical',
            serviceArea: 'Jakarta',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    console.log(`✅ [TECHNICIAN] Technician X dibuat: ${techX.email} / tech123 (Profile ID: ${techX.technicianProfile!.id})`);
  } else {
    if (!techX.technicianProfile) {
      await prisma.technicianProfile.create({
        data: {
          userId: techX.id,
          employeeCode: 'TECH-X-01',
          specialization: 'IoT Hardware & Electrical',
          serviceArea: 'Jakarta',
          availabilityStatus: 'AVAILABLE',
        },
      });
      techX = await prisma.user.findUnique({ where: { id: techX.id }, include: { technicianProfile: true } }) as any;
    }
    console.log(`✅ [TECHNICIAN] Technician X siap: ${techX!.email || techX!.username} (Profile ID: ${techX!.technicianProfile!.id})`);
  }

  // 5. Technician Y (technician.y@smarthome.id / tech123)
  let techY = await prisma.user.findFirst({
    where: {
      OR: [{ email: 'technician.y@smarthome.id' }, { username: 'tech_y' }],
    },
    include: { technicianProfile: true },
  });

  if (!techY) {
    techY = await prisma.user.create({
      data: {
        username: 'tech_y',
        email: 'technician.y@smarthome.id',
        name: 'Technician Y - Joko Widodo',
        role: 'TECHNICIAN',
        isActive: true,
        password: hashPassword('tech123'),
        technicianProfile: {
          create: {
            employeeCode: 'TECH-Y-02',
            specialization: 'Smart Security & Sensors',
            serviceArea: 'Bekasi & Tangerang',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    console.log(`✅ [TECHNICIAN] Technician Y dibuat: ${techY.email} / tech123 (Profile ID: ${techY.technicianProfile!.id})`);
  } else {
    if (!techY.technicianProfile) {
      await prisma.technicianProfile.create({
        data: {
          userId: techY.id,
          employeeCode: 'TECH-Y-02',
          specialization: 'Smart Security & Sensors',
          serviceArea: 'Bekasi & Tangerang',
          availabilityStatus: 'AVAILABLE',
        },
      });
      techY = await prisma.user.findUnique({ where: { id: techY.id }, include: { technicianProfile: true } }) as any;
    }
    console.log(`✅ [TECHNICIAN] Technician Y siap: ${techY!.email || techY!.username} (Profile ID: ${techY!.technicianProfile!.id})`);
  }

  // ---------------------------------------------------------------------------
  // PROPERTI CUSTOMER A: Rumah A1 (ACTIVE) dan Rumah A2 (CONFIGURING)
  // ---------------------------------------------------------------------------
  const custAProfileId = custA!.customerProfile!.id;

  // Properti A1: ACTIVE
  let houseA1 = await prisma.house.findFirst({
    where: {
      customerId: custAProfileId,
      name: { contains: 'Rumah A1' },
    },
  });

  if (!houseA1) {
    houseA1 = await prisma.house.create({
      data: {
        name: 'Rumah A1 (Active)',
        customerId: custAProfileId,
        setupStatus: 'ACTIVE',
        propertyType: 'HOUSE',
        address: 'Komplek Permata Hijau Blok A-1, Jakarta Selatan',
      },
    });
    console.log(`🏠 [HOUSE A1] Dibuat: '${houseA1.name}' (ID: ${houseA1.id}) - Status: ${houseA1.setupStatus}`);
  } else {
    if (houseA1.setupStatus !== 'ACTIVE') {
      houseA1 = await prisma.house.update({
        where: { id: houseA1.id },
        data: { setupStatus: 'ACTIVE' },
      });
    }
    console.log(`🏠 [HOUSE A1] Ada: '${houseA1.name}' (ID: ${houseA1.id}) - Status: ${houseA1.setupStatus}`);
  }

  // Pastikan Lantai 1, FloorPlan, Ruangan, dan Perangkat untuk A1
  let floorA1 = await prisma.floor.findFirst({ where: { houseId: houseA1.id, levelNumber: 1 } });
  if (!floorA1) {
    floorA1 = await prisma.floor.create({
      data: { houseId: houseA1.id, name: 'Lantai 1', levelNumber: 1 },
    });
  }

  let floorPlanA1 = await prisma.floorPlan.findFirst({ where: { floorId: floorA1.id } });
  if (!floorPlanA1) {
    floorPlanA1 = await prisma.floorPlan.create({
      data: {
        floorId: floorA1.id,
        name: 'Denah Lantai 1 Rumah A1',
        viewBoxWidth: 1000,
        viewBoxHeight: 800,
        pixelsPerMeter: 50,
      },
    });
  }

  let roomA1_1 = await prisma.room.findFirst({ where: { floorId: floorA1.id, name: 'Ruang Tamu A1' } });
  if (!roomA1_1) {
    roomA1_1 = await prisma.room.create({
      data: {
        floorId: floorA1.id,
        name: 'Ruang Tamu A1',
        color: '#3B82F6',
        polygonCoordinates: [
          { x: 50, y: 50 },
          { x: 450, y: 50 },
          { x: 450, y: 350 },
          { x: 50, y: 350 },
        ],
      },
    });
  }

  let roomA1_2 = await prisma.room.findFirst({ where: { floorId: floorA1.id, name: 'Kamar Tidur A1' } });
  if (!roomA1_2) {
    roomA1_2 = await prisma.room.create({
      data: {
        floorId: floorA1.id,
        name: 'Kamar Tidur A1',
        color: '#10B981',
        polygonCoordinates: [
          { x: 500, y: 50 },
          { x: 900, y: 50 },
          { x: 900, y: 350 },
          { x: 500, y: 350 },
        ],
      },
    });
  }

  // Perangkat A1
  let devA1_Light = await prisma.device.findFirst({
    where: { houseId: houseA1.id, name: 'Lampu Ruang Tamu A1' },
  });
  if (!devA1_Light) {
    devA1_Light = await prisma.device.create({
      data: {
        houseId: houseA1.id,
        floorId: floorA1.id,
        floorPlanId: floorPlanA1.id,
        roomId: roomA1_1.id,
        name: 'Lampu Ruang Tamu A1',
        type: 'LIGHT',
        status: 'ON',
        integrationStatus: 'SIMULATED',
        x: 250,
        y: 200,
        configuration: { brightness: 80 },
      },
    });
    // Create initial telemetry
    await prisma.deviceTelemetry.create({
      data: {
        deviceId: devA1_Light.id,
        metricType: 'state',
        stringValue: 'ON',
        isSimulated: true,
      },
    });
    console.log(`   💡 Perangkat A1 Dibuat: '${devA1_Light.name}' (ID: ${devA1_Light.id})`);
  }

  let devA1_AC = await prisma.device.findFirst({
    where: { houseId: houseA1.id, name: 'AC Kamar Tidur A1' },
  });
  if (!devA1_AC) {
    devA1_AC = await prisma.device.create({
      data: {
        houseId: houseA1.id,
        floorId: floorA1.id,
        floorPlanId: floorPlanA1.id,
        roomId: roomA1_2.id,
        name: 'AC Kamar Tidur A1',
        type: 'HVAC',
        status: 'OFF',
        integrationStatus: 'SIMULATED',
        x: 700,
        y: 200,
        configuration: { targetTemperature: 22, mode: 'COOL' },
      },
    });
    // Create initial telemetry
    await prisma.deviceTelemetry.create({
      data: {
        deviceId: devA1_AC.id,
        metricType: 'temperature',
        value: 25.0,
        unit: '°C',
        isSimulated: true,
      },
    });
    console.log(`   ❄️ Perangkat A1 Dibuat: '${devA1_AC.name}' (ID: ${devA1_AC.id})`);
  }

  // Aturan Otomasi A1
  let ruleA1 = await prisma.automationRule.findFirst({
    where: { houseId: houseA1.id, name: 'Auto Matikan Lampu Ruang Tamu A1' },
  });
  if (!ruleA1) {
    ruleA1 = await AutomationService.createRule({
      houseId: houseA1.id,
      name: 'Auto Matikan Lampu Ruang Tamu A1',
      conditions: [
        {
          type: 'DEVICE_STATE',
          deviceId: devA1_Light.id,
          property: 'status',
          operator: '==',
          value: 'ON',
        },
      ],
      actions: [
        {
          deviceId: devA1_Light.id,
          commandType: 'SET_POWER',
          payload: { power: false },
        },
      ],
    });
    console.log(`   ⚡ Aturan Otomasi A1 Dibuat: '${ruleA1.name}' (ID: ${ruleA1.id})`);
  }

  // Properti A2: CONFIGURING
  let houseA2 = await prisma.house.findFirst({
    where: {
      customerId: custAProfileId,
      name: { contains: 'Rumah A2' },
    },
  });

  if (!houseA2) {
    houseA2 = await prisma.house.create({
      data: {
        name: 'Rumah A2 (Configuring)',
        customerId: custAProfileId,
        setupStatus: 'CONFIGURING',
        propertyType: 'HOUSE',
        address: 'Perumahan Sentral Indah Kav. 12, Tangerang',
      },
    });
    console.log(`🏠 [HOUSE A2] Dibuat: '${houseA2.name}' (ID: ${houseA2.id}) - Status: ${houseA2.setupStatus}`);
  } else {
    if (houseA2.setupStatus !== 'CONFIGURING') {
      houseA2 = await prisma.house.update({
        where: { id: houseA2.id },
        data: { setupStatus: 'CONFIGURING' },
      });
    }
    console.log(`🏠 [HOUSE A2] Ada: '${houseA2.name}' (ID: ${houseA2.id}) - Status: ${houseA2.setupStatus}`);
  }

  // Setup Lantai & Ruangan dasar untuk A2 (agar ada data saat teknisi/admin membukanya)
  let floorA2 = await prisma.floor.findFirst({ where: { houseId: houseA2.id, levelNumber: 1 } });
  if (!floorA2) {
    floorA2 = await prisma.floor.create({
      data: { houseId: houseA2.id, name: 'Lantai 1', levelNumber: 1 },
    });
  }

  let floorPlanA2 = await prisma.floorPlan.findFirst({ where: { floorId: floorA2.id } });
  if (!floorPlanA2) {
    floorPlanA2 = await prisma.floorPlan.create({
      data: {
        floorId: floorA2.id,
        name: 'Denah Tahap Konfigurasi A2',
        viewBoxWidth: 800,
        viewBoxHeight: 600,
      },
    });
  }

  let roomA2 = await prisma.room.findFirst({ where: { floorId: floorA2.id, name: 'Ruang Tengah A2' } });
  if (!roomA2) {
    roomA2 = await prisma.room.create({
      data: { floorId: floorA2.id, name: 'Ruang Tengah A2' },
    });
  }

  let devA2 = await prisma.device.findFirst({ where: { houseId: houseA2.id, name: 'Lampu Penyiapan A2' } });
  if (!devA2) {
    devA2 = await prisma.device.create({
      data: {
        houseId: houseA2.id,
        floorId: floorA2.id,
        floorPlanId: floorPlanA2.id,
        roomId: roomA2.id,
        name: 'Lampu Penyiapan A2',
        type: 'LIGHT',
        status: 'OFF',
        integrationStatus: 'SIMULATED',
        x: 400,
        y: 300,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // PROPERTI CUSTOMER B: Rumah B1 (ACTIVE)
  // ---------------------------------------------------------------------------
  const custBProfileId = custB!.customerProfile!.id;

  let houseB1 = await prisma.house.findFirst({
    where: {
      customerId: custBProfileId,
      name: { contains: 'Rumah B1' },
    },
  });

  if (!houseB1) {
    houseB1 = await prisma.house.create({
      data: {
        name: 'Rumah B1 (Active)',
        customerId: custBProfileId,
        setupStatus: 'ACTIVE',
        propertyType: 'HOUSE',
        address: 'Graha Harmoni Residence No. 7, Jakarta Barat',
      },
    });
    console.log(`🏠 [HOUSE B1] Dibuat: '${houseB1.name}' (ID: ${houseB1.id}) - Status: ${houseB1.setupStatus}`);
  } else {
    if (houseB1.setupStatus !== 'ACTIVE') {
      houseB1 = await prisma.house.update({
        where: { id: houseB1.id },
        data: { setupStatus: 'ACTIVE' },
      });
    }
    console.log(`🏠 [HOUSE B1] Ada: '${houseB1.name}' (ID: ${houseB1.id}) - Status: ${houseB1.setupStatus}`);
  }

  let floorB1 = await prisma.floor.findFirst({ where: { houseId: houseB1.id, levelNumber: 1 } });
  if (!floorB1) {
    floorB1 = await prisma.floor.create({
      data: { houseId: houseB1.id, name: 'Lantai 1', levelNumber: 1 },
    });
  }

  let floorPlanB1 = await prisma.floorPlan.findFirst({ where: { floorId: floorB1.id } });
  if (!floorPlanB1) {
    floorPlanB1 = await prisma.floorPlan.create({
      data: {
        floorId: floorB1.id,
        name: 'Denah Lantai 1 Rumah B1',
        viewBoxWidth: 900,
        viewBoxHeight: 700,
      },
    });
  }

  let roomB1 = await prisma.room.findFirst({ where: { floorId: floorB1.id, name: 'Ruang Keluarga B1' } });
  if (!roomB1) {
    roomB1 = await prisma.room.create({
      data: { floorId: floorB1.id, name: 'Ruang Keluarga B1' },
    });
  }

  let devB1_Light = await prisma.device.findFirst({ where: { houseId: houseB1.id, name: 'Lampu Utama B1' } });
  if (!devB1_Light) {
    devB1_Light = await prisma.device.create({
      data: {
        houseId: houseB1.id,
        floorId: floorB1.id,
        floorPlanId: floorPlanB1.id,
        roomId: roomB1.id,
        name: 'Lampu Utama B1',
        type: 'LIGHT',
        status: 'OFF',
        integrationStatus: 'SIMULATED',
        x: 300,
        y: 200,
        configuration: { brightness: 70 },
      },
    });
    // Create initial telemetry
    await prisma.deviceTelemetry.create({
      data: {
        deviceId: devB1_Light.id,
        metricType: 'state',
        stringValue: 'OFF',
        isSimulated: true,
      },
    });
    console.log(`   💡 Perangkat B1 Dibuat: '${devB1_Light.name}' (ID: ${devB1_Light.id})`);
  }

  let devB1_AC = await prisma.device.findFirst({ where: { houseId: houseB1.id, name: 'AC Ruang Keluarga B1' } });
  if (!devB1_AC) {
    devB1_AC = await prisma.device.create({
      data: {
        houseId: houseB1.id,
        floorId: floorB1.id,
        floorPlanId: floorPlanB1.id,
        roomId: roomB1.id,
        name: 'AC Ruang Keluarga B1',
        type: 'HVAC',
        status: 'ON',
        integrationStatus: 'SIMULATED',
        x: 600,
        y: 200,
        configuration: { targetTemperature: 24, mode: 'COOL' },
      },
    });
    // Create initial telemetry
    await prisma.deviceTelemetry.create({
      data: {
        deviceId: devB1_AC.id,
        metricType: 'temperature',
        value: 24.0,
        unit: '°C',
        isSimulated: true,
      },
    });
    console.log(`   ❄️ Perangkat B1 Dibuat: '${devB1_AC.name}' (ID: ${devB1_AC.id})`);
  }

  let ruleB1 = await prisma.automationRule.findFirst({
    where: { houseId: houseB1.id, name: 'Auto Matikan AC B1' },
  });
  if (!ruleB1) {
    ruleB1 = await AutomationService.createRule({
      houseId: houseB1.id,
      name: 'Auto Matikan AC B1',
      conditions: [
        {
          type: 'DEVICE_STATE',
          deviceId: devB1_AC.id,
          property: 'status',
          operator: '==',
          value: 'ON',
        },
      ],
      actions: [
        {
          deviceId: devB1_AC.id,
          commandType: 'SET_POWER',
          payload: { power: false },
        },
      ],
    });
    console.log(`   ⚡ Aturan Otomasi B1 Dibuat: '${ruleB1.name}' (ID: ${ruleB1.id})`);
  }

  // ---------------------------------------------------------------------------
  // PROPERTI UNASSIGNED (Tanpa customerId / Legacy)
  // ---------------------------------------------------------------------------
  let unassignedHouse = await prisma.house.findFirst({
    where: { customerId: null },
  });

  if (!unassignedHouse) {
    unassignedHouse = await prisma.house.create({
      data: {
        name: 'Villa Sentosa (Legacy Unassigned)',
        customerId: null,
        setupStatus: 'DRAFT',
        propertyType: 'VILLA',
        address: 'Jl. Puncak Km 77, Bogor',
      },
    });
    console.log(`🏠 [LEGACY UNASSIGNED HOUSE] Dibuat: '${unassignedHouse.name}' (ID: ${unassignedHouse.id})`);
  } else {
    console.log(`🏠 [LEGACY UNASSIGNED HOUSE] Ada: '${unassignedHouse.name}' (ID: ${unassignedHouse.id})`);
  }

  console.log('\n===================================================================');
  console.log('✨ PERSIAPAN DATA PENGUJIAN SELESAI');
  console.log('===================================================================');
  console.log('RINGKASAN DATA:');
  console.log(`- Super Admin : admin / admin123 (SUPER_ADMIN)`);
  console.log(`- Customer A  : customer.a@smarthome.id / customer123 (Profile ID: ${custAProfileId})`);
  console.log(`  • Rumah A1  : ID = ${houseA1.id} (Status: ${houseA1.setupStatus})`);
  console.log(`    - Device 1: ${devA1_Light.name} (ID = ${devA1_Light.id})`);
  console.log(`    - Device 2: ${devA1_AC.name} (ID = ${devA1_AC.id})`);
  console.log(`    - Room    : ${roomA1_1.name} (ID = ${roomA1_1.id})`);
  console.log(`    - FloorPlan: ${floorPlanA1.name} (ID = ${floorPlanA1.id})`);
  console.log(`    - Rule    : ${ruleA1.name} (ID = ${ruleA1.id})`);
  console.log(`  • Rumah A2  : ID = ${houseA2.id} (Status: ${houseA2.setupStatus})`);
  console.log(`    - Device  : ${devA2.name} (ID = ${devA2.id})`);
  console.log(`- Customer B  : customer.b@smarthome.id / customer123 (Profile ID: ${custBProfileId})`);
  console.log(`  • Rumah B1  : ID = ${houseB1.id} (Status: ${houseB1.setupStatus})`);
  console.log(`    - Device 1: ${devB1_Light.name} (ID = ${devB1_Light.id})`);
  console.log(`    - Device 2: ${devB1_AC.name} (ID = ${devB1_AC.id})`);
  console.log(`    - Room    : ${roomB1.name} (ID = ${roomB1.id})`);
  console.log(`    - FloorPlan: ${floorPlanB1.name} (ID = ${floorPlanB1.id})`);
  console.log(`    - Rule    : ${ruleB1.name} (ID = ${ruleB1.id})`);
  console.log(`- Technician X: technician.x@smarthome.id / tech123 (Profile ID: ${techX!.technicianProfile!.id})`);
  console.log(`- Technician Y: technician.y@smarthome.id / tech123 (Profile ID: ${techY!.technicianProfile!.id})`);
  console.log(`- Unassigned  : ID = ${unassignedHouse.id} (Status: ${unassignedHouse.setupStatus})`);
  console.log('===================================================================\n');

  return {
    admin,
    custA,
    custB,
    techX,
    techY,
    houseA1,
    houseA2,
    houseB1,
    unassignedHouse,
    devices: {
      devA1_Light,
      devA1_AC,
      devA2,
      devB1_Light,
      devB1_AC,
    },
    rules: {
      ruleA1,
      ruleB1,
    },
  };
}

// Jalankan script langsung jika dipanggil
setupManualTestData()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('❌ Gagal menyiapkan data pengujian:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
