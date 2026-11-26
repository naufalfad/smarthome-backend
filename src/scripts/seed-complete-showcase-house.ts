import { PrismaClient, RoomType } from '@prisma/client';

const prisma = new PrismaClient();

const HOUSE_ID = '723b3e66-13ea-4089-8f1e-4f89ed439d3a';

export async function seedCompleteShowcaseHouse() {
  console.log('====================================================');
  console.log('🏡 SEEDING COMPLETE ACTIVE SMART HOME SHOWCASE');
  console.log('====================================================\n');

  // 1. Verify House & Customer
  let house = await prisma.house.findUnique({
    where: { id: HOUSE_ID },
    include: {
      customer: {
        include: {
          user: true,
        },
      },
      floors: {
        include: {
          floorPlan: true,
          rooms: true,
        },
      },
      serviceOrders: true,
    },
  });

  if (!house) {
    console.log(`Creating house '${HOUSE_ID}' (Rumah Balapan 2)...`);
    const customerProfile = await prisma.customerProfile.findFirst({
      include: { user: true },
    });

    house = await prisma.house.create({
      data: {
        id: HOUSE_ID,
        name: 'Rumah Balapan 2',
        customerId: customerProfile?.id,
        setupStatus: 'ACTIVE',
        publishStatus: 'PUBLISHED',
        hasPhysicalIot: true,
        description: 'Rumah tinggal modern 1 lantai 120m² dengan integrasi IoT komprehensif (Monitoring, Kontrol Jarak Jauh & CCTV Visual).',
        floors: {
          create: {
            name: 'Lantai 1',
            levelNumber: 1,
            floorPlan: {
              create: {
                name: 'Denah Arsitektur Lantai 1 (10.00 × 12.00 m)',
                viewBoxWidth: 2500,
                viewBoxHeight: 3000,
                publishStatus: 'PUBLISHED',
              },
            },
          },
        },
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
        floors: {
          include: {
            floorPlan: true,
            rooms: true,
          },
        },
        serviceOrders: true,
      },
    });
  }

  console.log(`✅ Found House: ${house.name} (${house.id})`);
  console.log(`   Customer: ${house.customer?.fullName} (${house.customer?.user?.email})`);

  // Ensure House is ACTIVE
  await prisma.house.update({
    where: { id: HOUSE_ID },
    data: {
      setupStatus: 'ACTIVE',
      publishStatus: 'PUBLISHED',
      hasPhysicalIot: true,
      description: 'Rumah tinggal modern 1 lantai 120m² dengan integrasi IoT komprehensif (Monitoring, Kontrol Jarak Jauh & CCTV Visual).',
    },
  });

  // Upgrade Service Order package snapshot to 30 devices
  if (house.serviceOrders.length > 0) {
    const order = house.serviceOrders[0];
    const snap = (order.packageSnapshot as any) || {};
    await prisma.serviceOrder.update({
      where: { id: order.id },
      data: {
        packageSnapshot: {
          ...snap,
          maxDevices: 30,
          packageName: 'Smart Villa Premium 3D + IoT (Full House)',
        },
      },
    });
    console.log(`✅ Upgraded ServiceOrder ${order.orderNumber} quota to 30 devices.`);
  }

  // 2. Setup Floor 1 & FloorPlan
  const floor1 = house.floors.find((f) => f.levelNumber === 1) || house.floors[0];
  if (!floor1) {
    throw new Error('Floor 1 not found for this house.');
  }

  const floorPlan = await prisma.floorPlan.upsert({
    where: { floorId: floor1.id },
    update: {
      name: 'Denah Arsitektur Lantai 1 (10.00 × 12.00 m)',
      imagePath: 'uploads/floor-plans/723b3e66-13ea-4089-8f1e-4f89ed439d3a/bg-1795511867504-b6d5ecdb-5.png',
      imageWidth: 2500,
      imageHeight: 3000,
      pixelsPerMeter: 170.0,
      isCalibrated: true,
      calibrationPoints: {
        point1: { x: 390, y: 370 },
        point2: { x: 2090, y: 370 },
        distanceMeters: 10.0,
        pixelDistance: 1700,
      },
      viewBoxX: 0,
      viewBoxY: 0,
      viewBoxWidth: 2500,
      viewBoxHeight: 3000,
      rotation: 0,
      isBackgroundVisible: true,
      backgroundOpacity: 1.0,
    },
    create: {
      floorId: floor1.id,
      name: 'Denah Arsitektur Lantai 1 (10.00 × 12.00 m)',
      imagePath: 'uploads/floor-plans/723b3e66-13ea-4089-8f1e-4f89ed439d3a/bg-1795511867504-b6d5ecdb-5.png',
      imageWidth: 2500,
      imageHeight: 3000,
      pixelsPerMeter: 170.0,
      isCalibrated: true,
      calibrationPoints: {
        point1: { x: 390, y: 370 },
        point2: { x: 2090, y: 370 },
        distanceMeters: 10.0,
        pixelDistance: 1700,
      },
      viewBoxX: 0,
      viewBoxY: 0,
      viewBoxWidth: 2500,
      viewBoxHeight: 3000,
      rotation: 0,
      isBackgroundVisible: true,
      backgroundOpacity: 1.0,
    },
  });

  console.log(`✅ FloorPlan configured: ${floorPlan.id} (PPM: 170.0, Dims: 2500x3000)`);

  // 3. Clear existing old rooms on Floor 1 and re-seed Canonical Architectural Rooms
  await prisma.device.deleteMany({
    where: { floorPlanId: floorPlan.id },
  });
  await prisma.room.deleteMany({
    where: { floorId: floor1.id },
  });

  const ROOMS_DATA = [
    {
      name: 'Ruang Tamu (Living Room)',
      type: 'LIVING_ROOM' as RoomType,
      color: '#6366F1',
      polygonCoordinates: [
        { x: 390, y: 1560 },
        { x: 1155, y: 1560 },
        { x: 1155, y: 2260 },
        { x: 390, y: 2260 },
      ],
      areaSquareMeters: 22.5,
    },
    {
      name: 'Ruang Makan (Dining Room)',
      type: 'DINING_ROOM' as RoomType,
      color: '#0EA5E9',
      polygonCoordinates: [
        { x: 390, y: 1016 },
        { x: 1155, y: 1016 },
        { x: 1155, y: 1560 },
        { x: 390, y: 1560 },
      ],
      areaSquareMeters: 14.4,
    },
    {
      name: 'Dapur (Kitchen)',
      type: 'KITCHEN' as RoomType,
      color: '#F59E0B',
      polygonCoordinates: [
        { x: 390, y: 370 },
        { x: 1155, y: 370 },
        { x: 1155, y: 1016 },
        { x: 390, y: 1016 },
      ],
      areaSquareMeters: 17.1,
    },
    {
      name: 'Kamar Mandi (Bathroom)',
      type: 'BATHROOM' as RoomType,
      color: '#10B981',
      polygonCoordinates: [
        { x: 1155, y: 370 },
        { x: 1546, y: 370 },
        { x: 1546, y: 795 },
        { x: 1155, y: 795 },
      ],
      areaSquareMeters: 5.75,
    },
    {
      name: 'Lorong Tengah (Hallway)',
      type: 'OTHER' as RoomType,
      color: '#8B5CF6',
      polygonCoordinates: [
        { x: 1155, y: 795 },
        { x: 1410, y: 795 },
        { x: 1410, y: 1730 },
        { x: 1155, y: 1730 },
      ],
      areaSquareMeters: 8.25,
    },
    {
      name: 'Kamar Tidur Utama (Master Bedroom)',
      type: 'BEDROOM' as RoomType,
      color: '#6366F1',
      polygonCoordinates: [
        { x: 1410, y: 1186 },
        { x: 2090, y: 1186 },
        { x: 2090, y: 2240 },
        { x: 1410, y: 2240 },
      ],
      areaSquareMeters: 24.8,
    },
    {
      name: 'Kamar Tidur 2 (Bedroom 2)',
      type: 'BEDROOM' as RoomType,
      color: '#EC4899',
      polygonCoordinates: [
        { x: 1546, y: 370 },
        { x: 2090, y: 370 },
        { x: 2090, y: 1186 },
        { x: 1546, y: 1186 },
      ],
      areaSquareMeters: 15.36,
    },
    {
      name: 'Teras Depan & Pintu Masuk',
      type: 'OTHER' as RoomType,
      color: '#F43F5E',
      polygonCoordinates: [
        { x: 750, y: 2260 },
        { x: 1430, y: 2260 },
        { x: 1430, y: 2430 },
        { x: 750, y: 2430 },
      ],
      areaSquareMeters: 6.0,
    },
  ];

  const createdRooms: Record<string, any> = {};

  for (const r of ROOMS_DATA) {
    const created = await prisma.room.create({
      data: {
        floorId: floor1.id,
        name: r.name,
        type: r.type,
        color: r.color,
        polygonCoordinates: r.polygonCoordinates,
        areaSquareMeters: r.areaSquareMeters,
        isActive: true,
      },
    });
    createdRooms[r.name] = created;
    console.log(`  🏠 Created Room: ${created.name} (${created.areaSquareMeters} m²)`);
  }

  // 4. Fetch Catalog Items to link devices
  const catalogItems = await prisma.deviceCatalogItem.findMany();
  const catalogMap = new Map<string, any>();
  for (const item of catalogItems) {
    catalogMap.set(item.deviceType, item);
  }

  // 5. Seed Real Full-House IoT Devices (22 devices across 3 categories)
  const DEVICES_TO_SEED = [
    // --- TERAS & PINTU MASUK ---
    {
      name: 'Smart Biometric Door Lock',
      type: 'SMART_LOCK',
      roomName: 'Ruang Tamu (Living Room)',
      x: 920,
      y: 2210,
      rotation: 0,
      status: 'LOCKED',
      integrationStatus: 'SIMULATED',
      config: {
        lockState: 'LOCKED',
        autoLock: true,
        autoLockDelaySeconds: 5,
        batteryLevel: 94,
        tamperAlert: false,
        labelPosition: 'bottom',
      },
    },
    {
      name: 'Kamera Pengawas Teras 2K',
      type: 'OUTDOOR_CAMERA',
      roomName: 'Teras Depan & Pintu Masuk',
      x: 830,
      y: 2460,
      rotation: 90,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        streamStatus: 'ONLINE',
        streamUrl: 'mock://live/cctv-front-porch.m3u8',
        streamProtocol: 'HLS',
        resolution: '2K QHD (2560x1440)',
        fps: 30,
        bitrateKbps: 2450,
        codec: 'H.265 / HEVC',
        nightVision: true,
        storageMode: 'SD_CARD',
        recordingMode: 'MOTION_ONLY',
        motionDetected: false,
        aiDetectionLabel: 'Human: 96%',
        signalStrengthDbm: -44,
        cameraPreset: 'TERAS_FRONT',
        labelPosition: 'left',
      },
    },
    {
      name: 'Bel Pintu Video & Interkom',
      type: 'VIDEO_DOORBELL',
      roomName: 'Teras Depan & Pintu Masuk',
      x: 1080,
      y: 2260,
      rotation: 90,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        streamStatus: 'ONLINE',
        streamUrl: 'mock://live/doorbell-entry.m3u8',
        streamProtocol: 'WEBRTC',
        resolution: '1080p FHD (1440x1080)',
        fps: 25,
        bitrateKbps: 1800,
        doorbellPressed: false,
        twoWayAudioActive: false,
        batteryLevel: 92,
        storageMode: 'CLOUD',
        cameraPreset: 'DOORBELL_VERTICAL',
        labelPosition: 'right',
      },
    },
    {
      name: 'Sensor Kontak Pintu Depan',
      type: 'DOOR_WINDOW_SENSOR',
      roomName: 'Ruang Tamu (Living Room)',
      x: 850,
      y: 2150,
      rotation: 0,
      status: 'CLOSED',
      integrationStatus: 'SIMULATED',
      config: {
        contact: true,
        isOpen: false,
        tamperAlert: false,
        batteryLevel: 96,
        labelPosition: 'top',
      },
    },

    // --- LIVING ROOM ---
    {
      name: 'Lampu Utama Ruang Tamu',
      type: 'SMART_LIGHT',
      roomName: 'Ruang Tamu (Living Room)',
      x: 750,
      y: 1880,
      rotation: 0,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        brightness: 80,
      },
    },
    {
      name: 'AC Inverter Ruang Tamu 2 PK',
      type: 'SMART_AC',
      roomName: 'Ruang Tamu (Living Room)',
      x: 770,
      y: 1580,
      rotation: 180,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        targetTemperature: 24,
        currentTemperature: 24.5,
        mode: 'COOL',
        fanSpeed: 'AUTO',
      },
    },
    {
      name: 'Kamera Indoor 360° Ruang Tamu',
      type: 'INDOOR_CAMERA',
      roomName: 'Ruang Tamu (Living Room)',
      x: 1100,
      y: 1600,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        streamStatus: 'ONLINE',
        streamUrl: 'mock://live/cctv-indoor-living.m3u8',
        streamProtocol: 'HLS',
        resolution: '2K 360 PTZ (2304x1296)',
        fps: 30,
        bitrateKbps: 2200,
        privacyMode: false,
        panAngle: 15,
        tiltAngle: 10,
        ptzCapable: true,
        cameraPreset: 'INDOOR_PANORAMA',
      },
    },
    {
      name: 'Stopkontak TV Entertainment',
      type: 'SMART_PLUG',
      roomName: 'Ruang Tamu (Living Room)',
      x: 1100,
      y: 1750,
      rotation: 0,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        powerDrawWatts: 68,
        energyKwh: 4.8,
      },
    },
    {
      name: 'Gorden Otomatis Jendela Barat',
      type: 'SMART_CURTAIN',
      roomName: 'Ruang Tamu (Living Room)',
      x: 390,
      y: 1850,
      rotation: 90,
      status: 'OPEN',
      integrationStatus: 'SIMULATED',
      config: {
        position: 70,
        command: 'STOP',
      },
    },
    {
      name: 'Monitor Kualitas Udara (IAQ)',
      type: 'AIR_QUALITY_SENSOR',
      roomName: 'Ruang Tamu (Living Room)',
      x: 1100,
      y: 1950,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        aqi: 28,
        pm25: 8,
        pm10: 15,
        co2: 450,
      },
    },

    // --- DINING ROOM ---
    {
      name: 'Lampu Gantung Meja Makan',
      type: 'SMART_DIMMER',
      roomName: 'Ruang Makan (Dining Room)',
      x: 770,
      y: 1280,
      rotation: 0,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        brightness: 75,
        colorTemperature: 3000,
      },
    },

    // --- KITCHEN ---
    {
      name: 'Detektor Asap Dapur (NFPA)',
      type: 'SMOKE_FIRE_SENSOR',
      roomName: 'Dapur (Kitchen)',
      x: 750,
      y: 520,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        smokeDetected: false,
        smokeLevel: 10,
        alarmState: 'NORMAL',
        batteryLevel: 96,
      },
    },
    {
      name: 'Detektor Kebocoran Gas LPG',
      type: 'GAS_LEAK_SENSOR',
      roomName: 'Dapur (Kitchen)',
      x: 650,
      y: 500,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        gasPpm: 18,
        isGasLeak: false,
        safetyStatus: 'SAFE',
      },
    },
    {
      name: 'Exhaust Fan Dapur Pintar',
      type: 'SMART_EXHAUST_FAN',
      roomName: 'Dapur (Kitchen)',
      x: 630,
      y: 420,
      rotation: 0,
      status: 'OFF',
      integrationStatus: 'SIMULATED',
      config: {
        power: false,
        speed: 'MEDIUM',
      },
    },

    // --- BATHROOM ---
    {
      name: 'Sensor Kebocoran Air Kamar Mandi',
      type: 'WATER_LEAK_SENSOR',
      roomName: 'Kamar Mandi (Bathroom)',
      x: 1380,
      y: 520,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        leakDetected: false,
        leakStatus: 'DRY',
        batteryLevel: 99,
      },
    },
    {
      name: 'Radar Keberadaan Kamar Mandi',
      type: 'PRESENCE_RADAR_SENSOR',
      roomName: 'Kamar Mandi (Bathroom)',
      x: 1350,
      y: 600,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        presence: false,
        presenceStatus: 'VACANT',
        targetDistance: 0,
      },
    },

    // --- HALLWAY (LORONG) ---
    {
      name: 'Sensor Gerak PIR Lorong',
      type: 'PIR_MOTION_SENSOR',
      roomName: 'Lorong Tengah (Hallway)',
      x: 1280,
      y: 1100,
      rotation: 270,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        motion: false,
        motionStatus: 'CLEAR',
        motionCooldownSeconds: 60,
      },
    },
    {
      name: 'Smart Display Hub Dinding',
      type: 'SMART_DISPLAY_HUB',
      roomName: 'Lorong Tengah (Hallway)',
      x: 1200,
      y: 1400,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        screenPower: true,
        brightness: 85,
        activeView: 'FLOOR_PLAN',
      },
    },
    {
      name: 'Meteran Beban Listrik MCB',
      type: 'ENERGY_MONITOR',
      roomName: 'Lorong Tengah (Hallway)',
      x: 1170,
      y: 830,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        powerWatts: 820,
        voltageVolts: 221.8,
        currentAmperes: 3.7,
        energyKwh: 142.0,
      },
    },

    // --- MASTER BEDROOM ---
    {
      name: 'AC Inverter Kamar Utama 1 PK',
      type: 'SMART_AC',
      roomName: 'Kamar Tidur Utama (Master Bedroom)',
      x: 1440,
      y: 1750,
      rotation: 0,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        targetTemperature: 23,
        currentTemperature: 23.8,
        mode: 'COOL',
        fanSpeed: 'LOW',
      },
    },
    {
      name: 'Sensor Suhu & Kelembapan Kasur',
      type: 'TEMP_HUMIDITY_SENSOR',
      roomName: 'Kamar Tidur Utama (Master Bedroom)',
      x: 1750,
      y: 1450,
      rotation: 0,
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      config: {
        temperature: 23.8,
        humidity: 55,
      },
    },
    {
      name: 'Lampu Kamar Tidur Utama',
      type: 'SMART_LIGHT',
      roomName: 'Kamar Tidur Utama (Master Bedroom)',
      x: 1750,
      y: 1620,
      rotation: 0,
      status: 'ON',
      integrationStatus: 'SIMULATED',
      config: {
        power: true,
        brightness: 60,
      },
    },

    // --- BEDROOM 2 ---
    {
      name: 'Lampu Kamar Tidur 2',
      type: 'SMART_LIGHT',
      roomName: 'Kamar Tidur 2 (Bedroom 2)',
      x: 1810,
      y: 680,
      rotation: 0,
      status: 'OFF',
      integrationStatus: 'SIMULATED',
      config: {
        power: false,
        brightness: 100,
      },
    },
    {
      name: 'AC Kamar Tidur 2 (1/2 PK)',
      type: 'SMART_AC',
      roomName: 'Kamar Tidur 2 (Bedroom 2)',
      x: 1570,
      y: 850,
      rotation: 0,
      status: 'OFF',
      integrationStatus: 'SIMULATED',
      config: {
        power: false,
        targetTemperature: 25,
        currentTemperature: 27.5,
        mode: 'COOL',
        fanSpeed: 'AUTO',
      },
    },
  ];

  console.log(`\n📦 Seeding ${DEVICES_TO_SEED.length} Devices onto FloorPlan...`);

  for (const d of DEVICES_TO_SEED) {
    const room = createdRooms[d.roomName];
    const catalogItem = catalogMap.get(d.type);

    const normX = Number((d.x / 2500).toFixed(4));
    const normY = Number((d.y / 3000).toFixed(4));

    const device = await prisma.device.create({
      data: {
        name: d.name,
        type: d.type,
        status: d.status,
        integrationStatus: d.integrationStatus,
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        x: d.x,
        y: d.y,
        normalizedX: normX,
        normalizedY: normY,
        rotation: d.rotation,
        iconWidth: 48,
        iconHeight: 48,
        manualRoomName: d.roomName,
        configuration: d.config,
        houseId: HOUSE_ID,
        floorId: floor1.id,
        floorPlanId: floorPlan.id,
        roomId: room?.id || null,
        catalogItemId: catalogItem?.id || null,
      },
    });

    console.log(`  🔌 [${d.type}] ${device.name} @ (${d.x}, ${d.y}) in ${d.roomName}`);
  }

  const finalDeviceCount = await prisma.device.count({ where: { houseId: HOUSE_ID } });
  console.log('\n====================================================');
  console.log(`🎉 SUCCESS! Seeded full-house showcase:`);
  console.log(`   - House: ${house.name} (${house.id}) [ACTIVE]`);
  console.log(`   - Rooms: ${ROOMS_DATA.length} canonical rooms with polygons`);
  console.log(`   - Devices: ${finalDeviceCount} real database devices`);
  console.log('====================================================');
}

// Standalone execution
if (process.argv[1]?.includes('seed-complete-showcase-house')) {
  seedCompleteShowcaseHouse()
    .catch((err) => {
      console.error('❌ Failed to seed showcase house:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
