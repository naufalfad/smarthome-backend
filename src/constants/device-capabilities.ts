export type DevicePropertyType = 'boolean' | 'number' | 'string' | 'enum';

export interface DeviceCapability {
  property: string;
  label: string;
  type: DevicePropertyType;
  unit?: string;
  defaultValue: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  controllable: boolean; // true = controllable by user/client; false = read-only telemetry sensor
  description?: string;
}

export type DeviceCatalogCategory = 'MONITORING' | 'CONTROL' | 'VISUAL' | string;

export interface DeviceCatalogDefinition {
  deviceType: string;
  name: string;
  category: DeviceCatalogCategory;
  description: string;
  icon: string;
  color: string;
  defaultWidth: number;
  defaultHeight: number;
  capabilities: DeviceCapability[];
  defaultConfiguration: Record<string, any>;
}

export const IOT_DEVICE_CATALOG: DeviceCatalogDefinition[] = [
  // =========================================================================
  // KATEGORI 1: MONITORING & SENSOR STATUS (Read-Only / Pemberi Informasi)
  // =========================================================================

  // 1. Sensor Suhu & Kelembapan
  {
    deviceType: 'TEMP_HUMIDITY_SENSOR',
    name: 'Sensor Suhu & Kelembapan',
    category: 'MONITORING',
    description: 'Sensor pemantau suhu (°C) dan kelembapan udara (%RH) ruangan secara berkala.',
    icon: 'thermometer',
    color: '#10B981',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'temperature',
        label: 'Suhu Lingkungan',
        type: 'number',
        unit: '°C',
        min: -10,
        max: 60,
        defaultValue: 25.5,
        controllable: false,
        description: 'Pembacaan suhu lingkungan saat ini dalam derajat Celsius',
      },
      {
        property: 'humidity',
        label: 'Kelembapan Udara',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 58,
        controllable: false,
        description: 'Pembacaan kelembapan relatif udara saat ini dalam persen',
      },
    ],
    defaultConfiguration: {
      temperature: 25.5,
      humidity: 58,
    },
  },

  // 2. Sensor Volume Air Tandon (Toren)
  {
    deviceType: 'WATER_LEVEL_SENSOR',
    name: 'Sensor Volume Air Tandon (Toren)',
    category: 'MONITORING',
    description: 'Sensor pemantau ketinggian dan persentase volume air toren penampungan rumah.',
    icon: 'droplets',
    color: '#0284C7',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'waterLevel',
        label: 'Persentase Air',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 85,
        controllable: false,
        description: 'Persentase isi air tandon toren (0 - 100%)',
      },
      {
        property: 'volumeLiters',
        label: 'Volume Air',
        type: 'number',
        unit: 'L',
        min: 0,
        max: 5000,
        defaultValue: 850,
        controllable: false,
        description: 'Estimasi volume air dalam satuan Liter',
      },
      {
        property: 'levelStatus',
        label: 'Status Ketinggian Air',
        type: 'enum',
        options: ['CRITICAL', 'LOW', 'NORMAL', 'FULL'],
        defaultValue: 'NORMAL',
        controllable: false,
        description: 'Status indikator ketinggian air tandon',
      },
    ],
    defaultConfiguration: {
      waterLevel: 85,
      volumeLiters: 850,
      levelStatus: 'NORMAL',
    },
  },

  // 3. Lampu Sensor Otomatis Gelap-Terang (Dusk-to-Dawn Photocell)
  {
    deviceType: 'AUTO_DUSK_DAWN_LIGHT',
    name: 'Lampu Otomatis Sensor Gelap (Photocell)',
    category: 'MONITORING',
    description: 'Lampu mandiri yang menyala otomatis saat gelap dan padam saat terang. Status dikirim sebagai informasi.',
    icon: 'lightbulb',
    color: '#F59E0B',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'isLightOn',
        label: 'Status Menyala',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Status fisik lampu saat ini: Menyala (true) atau Padam (false)',
      },
      {
        property: 'illuminance',
        label: 'Intensitas Cahaya Luar',
        type: 'number',
        unit: 'Lux',
        min: 0,
        max: 1000,
        defaultValue: 450,
        controllable: false,
        description: 'Pembacaan intensitas cahaya sekitar oleh sensor photocell',
      },
      {
        property: 'mode',
        label: 'Mode Operasi',
        type: 'string',
        defaultValue: 'DUSK_TO_DAWN_AUTO',
        controllable: false,
        description: 'Mode kerja lampu otomatis mandiri',
      },
    ],
    defaultConfiguration: {
      isLightOn: false,
      illuminance: 450,
      mode: 'DUSK_TO_DAWN_AUTO',
    },
  },

  // 4. Lampu Lorong Sensor Gerak Mandiri
  {
    deviceType: 'AUTO_PIR_NIGHT_LIGHT',
    name: 'Lampu Lorong Sensor Gerak Mandiri',
    category: 'MONITORING',
    description: 'Lampu malam lorong yang menyala otomatis selama 60 detik jika mendeteksi langkah kaki.',
    icon: 'lightbulb',
    color: '#EAB308',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'isActive',
        label: 'Status Siaga',
        type: 'boolean',
        defaultValue: true,
        controllable: false,
        description: 'Sensor gerak lampu aktif dan siap memicu penerangan',
      },
      {
        property: 'motionTriggered',
        label: 'Sedang Dipicu Gerakan',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Lampu sedang menyala karena terdeteksi gerakan orang melintas',
      },
    ],
    defaultConfiguration: {
      isActive: true,
      motionTriggered: false,
    },
  },

  // 5. Sensor Deteksi Kebocoran Air / Banjir
  {
    deviceType: 'WATER_LEAK_SENSOR',
    name: 'Sensor Deteksi Kebocoran Air / Banjir',
    category: 'MONITORING',
    description: 'Sensor probe lantai pendeteksi genangan air atau rembesan pipa di kamar mandi dan dapur.',
    icon: 'droplets',
    color: '#06B6D4',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'leakDetected',
        label: 'Terdeteksi Kebocoran',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Status apakah elektroda sensor menyentuh genangan air',
      },
      {
        property: 'leakStatus',
        label: 'Status Permukaan',
        type: 'enum',
        options: ['DRY', 'LEAK_DETECTED'],
        defaultValue: 'DRY',
        controllable: false,
        description: 'Status kondisi lantai: Kering (DRY) atau Bocor (LEAK_DETECTED)',
      },
      {
        property: 'batteryLevel',
        label: 'Level Baterai',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 98,
        controllable: false,
        description: 'Sisa daya baterai sensor internal',
      },
    ],
    defaultConfiguration: {
      leakDetected: false,
      leakStatus: 'DRY',
      batteryLevel: 98,
    },
  },

  // 6. Sensor Deteksi Asap & Panas Api (NFPA)
  {
    deviceType: 'SMOKE_FIRE_SENSOR',
    name: 'Sensor Deteksi Asap & Panas Api (NFPA)',
    category: 'MONITORING',
    description: 'Sensor optikal pendeteksi kepulan asap kebakaran dan kenaikan suhu ekstrem di plafon.',
    icon: 'flame',
    color: '#EF4444',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'smokeDetected',
        label: 'Terdeteksi Asap',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Indikasi bahaya asap tebal di ruangan',
      },
      {
        property: 'smokeLevel',
        label: 'Kepekatan Asap',
        type: 'number',
        unit: 'ppm',
        min: 0,
        max: 500,
        defaultValue: 12,
        controllable: false,
        description: 'Tingkat partikel asap terdeteksi',
      },
      {
        property: 'alarmState',
        label: 'Status Alarm',
        type: 'enum',
        options: ['NORMAL', 'WARNING', 'ALARM'],
        defaultValue: 'NORMAL',
        controllable: false,
        description: 'Tingkat kesiagaan sensor bahaya kebakaran',
      },
    ],
    defaultConfiguration: {
      smokeDetected: false,
      smokeLevel: 12,
      alarmState: 'NORMAL',
    },
  },

  // 7. Sensor Kebocoran Gas LPG & Metana
  {
    deviceType: 'GAS_LEAK_SENSOR',
    name: 'Sensor Kebocoran Gas LPG & Metana',
    category: 'MONITORING',
    description: 'Sensor gas semikonduktor pendeteksi kebocoran tabung elpiji atau gas pipa dapur.',
    icon: 'flame',
    color: '#F97316',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'gasPpm',
        label: 'Konsentrasi Gas',
        type: 'number',
        unit: 'ppm',
        min: 0,
        max: 10000,
        defaultValue: 25,
        controllable: false,
        description: 'Konsentrasi gas mudah terbakar di sekitar kompor',
      },
      {
        property: 'isGasLeak',
        label: 'Bahaya Gas Bocor',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Indikasi darurat kebocoran gas metana / LPG',
      },
      {
        property: 'safetyStatus',
        label: 'Status Keamanan',
        type: 'enum',
        options: ['SAFE', 'GAS_LEAK'],
        defaultValue: 'SAFE',
        controllable: false,
        description: 'Status keselamatan zona kompor dapur',
      },
    ],
    defaultConfiguration: {
      gasPpm: 25,
      isGasLeak: false,
      safetyStatus: 'SAFE',
    },
  },

  // 8. Sensor Kontak Magnetik Pintu / Jendela
  {
    deviceType: 'DOOR_WINDOW_SENSOR',
    name: 'Sensor Kontak Magnetik Pintu / Jendela',
    category: 'MONITORING',
    description: 'Sensor magnetik pembaca status fisik apakah daun pintu atau jendela terbuka atau tertutup rapat.',
    icon: 'door',
    color: '#6366F1',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'contact',
        label: 'Kontak Magnetik',
        type: 'boolean',
        defaultValue: true,
        controllable: false,
        description: 'Kontak tertutup rapat (true) atau terpisah/terbuka (false)',
      },
      {
        property: 'isOpen',
        label: 'Status Terbuka',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Apakah pintu/jendela sedang dalam kondisi terbuka',
      },
      {
        property: 'openDurationSeconds',
        label: 'Durasi Terbuka',
        type: 'number',
        unit: 's',
        min: 0,
        max: 86400,
        defaultValue: 0,
        controllable: false,
        description: 'Lama waktu pintu/jendela dibiarkan terbuka (dalam detik)',
      },
    ],
    defaultConfiguration: {
      contact: true,
      isOpen: false,
      openDurationSeconds: 0,
    },
  },

  // 9. Sensor Gerak Inframerah (PIR)
  {
    deviceType: 'PIR_MOTION_SENSOR',
    name: 'Sensor Gerak Inframerah (PIR)',
    category: 'MONITORING',
    description: 'Sensor pasif inframerah pendeteksi pergerakan manusia di sudut koridor atau ruangan.',
    icon: 'radio',
    color: '#10B981',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'motion',
        label: 'Deteksi Gerakan',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Pergerakan manusia saat ini terdeteksi',
      },
      {
        property: 'motionStatus',
        label: 'Status Pergerakan',
        type: 'enum',
        options: ['CLEAR', 'DETECTED'],
        defaultValue: 'CLEAR',
        controllable: false,
        description: 'Kondisi zona pantauan gerak: Sunyi (CLEAR) atau Terdeteksi (DETECTED)',
      },
    ],
    defaultConfiguration: {
      motion: false,
      motionStatus: 'CLEAR',
    },
  },

  // 10. Sensor Keberadaan Presisi (Radar mmWave)
  {
    deviceType: 'PRESENCE_RADAR_SENSOR',
    name: 'Sensor Keberadaan Presisi (Radar mmWave)',
    category: 'MONITORING',
    description: 'Radar gelombang mikro 60 GHz pendeteksi pernapasan mikro dan keberadaan manusia diam.',
    icon: 'radio',
    color: '#8B5CF6',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'presence',
        label: 'Keberadaan Manusia',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Terdeteksi orang berada di dalam ruangan (termasuk saat diam tidur)',
      },
      {
        property: 'presenceStatus',
        label: 'Status Okupansi',
        type: 'enum',
        options: ['VACANT', 'OCCUPIED'],
        defaultValue: 'VACANT',
        controllable: false,
        description: 'Status okupansi ruangan: Kosong (VACANT) atau Terisi (OCCUPIED)',
      },
      {
        property: 'targetDistance',
        label: 'Jarak Subjek',
        type: 'number',
        unit: 'm',
        min: 0,
        max: 8,
        defaultValue: 0,
        controllable: false,
        description: 'Jarak subjek manusia terdekat dari sensor dalam meter',
      },
    ],
    defaultConfiguration: {
      presence: false,
      presenceStatus: 'VACANT',
      targetDistance: 0,
    },
  },

  // 11. Sensor Kualitas Udara Komprehensif
  {
    deviceType: 'AIR_QUALITY_SENSOR',
    name: 'Sensor Kualitas Udara Komprehensif',
    category: 'MONITORING',
    description: 'Sensor pendeteksi indeks kualitas udara (AQI), partikel halus PM2.5, debu PM10, dan kadar CO2.',
    icon: 'activity',
    color: '#06B6D4',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'aqi',
        label: 'Indeks Kualitas Udara (AQI)',
        type: 'number',
        unit: 'AQI',
        min: 0,
        max: 500,
        defaultValue: 35,
        controllable: false,
        description: 'Indeks kualitas udara (0-50 Baik, 51-100 Sedang, >100 Tidak Sehat)',
      },
      {
        property: 'pm25',
        label: 'Partikel PM2.5',
        type: 'number',
        unit: 'µg/m³',
        min: 0,
        max: 1000,
        defaultValue: 12,
        controllable: false,
        description: 'Konsentrasi partikel debu halus <= 2.5 mikrometer',
      },
      {
        property: 'pm10',
        label: 'Partikel PM10',
        type: 'number',
        unit: 'µg/m³',
        min: 0,
        max: 1000,
        defaultValue: 22,
        controllable: false,
        description: 'Konsentrasi partikel debu <= 10 mikrometer',
      },
      {
        property: 'co2',
        label: 'Kadar CO2',
        type: 'number',
        unit: 'ppm',
        min: 300,
        max: 5000,
        defaultValue: 480,
        controllable: false,
        description: 'Konsentrasi karbon dioksida di dalam ruangan',
      },
    ],
    defaultConfiguration: {
      aqi: 35,
      pm25: 12,
      pm10: 22,
      co2: 480,
    },
  },

  // 12. Sensor Beban Listrik Panel MCB Utama
  {
    deviceType: 'ENERGY_MONITOR',
    name: 'Sensor Beban Listrik Panel MCB Utama',
    category: 'MONITORING',
    description: 'Sensor CT clamp pembaca daya total rumah (Watt), arus listrik (A), dan tegangan (V) di box MCB.',
    icon: 'gauge',
    color: '#F59E0B',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'powerWatts',
        label: 'Konsumsi Daya Aktif',
        type: 'number',
        unit: 'W',
        min: 0,
        max: 20000,
        defaultValue: 750,
        controllable: false,
        description: 'Beban daya listrik rumah yang sedang menyala saat ini dalam Watt',
      },
      {
        property: 'voltageVolts',
        label: 'Tegangan Listrik',
        type: 'number',
        unit: 'V',
        min: 180,
        max: 260,
        defaultValue: 221.5,
        controllable: false,
        description: 'Tegangan voltase listrik jala-jala PLN',
      },
      {
        property: 'currentAmperes',
        label: 'Arus Listrik',
        type: 'number',
        unit: 'A',
        min: 0,
        max: 100,
        defaultValue: 3.4,
        controllable: false,
        description: 'Arus listrik total yang mengalir dalam Ampere',
      },
      {
        property: 'energyKwh',
        label: 'Total Pemakaian Energi',
        type: 'number',
        unit: 'kWh',
        min: 0,
        max: 999999,
        defaultValue: 124.5,
        controllable: false,
        description: 'Akumulasi konsumsi energi dalam kilowatt-hour',
      },
    ],
    defaultConfiguration: {
      powerWatts: 750,
      voltageVolts: 221.5,
      currentAmperes: 3.4,
      energyKwh: 124.5,
    },
  },

  // =========================================================================
  // KATEGORI 2: KONTROL JARAK JAUH / REMOTE ACTUATORS (Bisa Dikendalikan Pemilik)
  // =========================================================================

  // 13. Lampu Pintar Kontrol (On/Off & Dimmer)
  {
    deviceType: 'SMART_LIGHT',
    name: 'Lampu Pintar Kontrol (On/Off & Dimmer)',
    category: 'CONTROL',
    description: 'Lampu cerdas dengan kontrol daya On/Off dan pengaturan tingkat kecerahan.',
    icon: 'lightbulb',
    color: '#EAB308',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'power',
        label: 'Daya Lampu',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status daya hidup (ON) atau mati (OFF)',
      },
      {
        property: 'brightness',
        label: 'Tingkat Kecerahan',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 80,
        controllable: true,
        description: 'Persentase intensitas cahaya 0 - 100%',
      },
    ],
    defaultConfiguration: {
      power: true,
      brightness: 80,
    },
  },

  // 14. Lampu Nuansa Pintar (CCT Tunable White)
  {
    deviceType: 'SMART_DIMMER',
    name: 'Lampu Nuansa Pintar (CCT Tunable White)',
    category: 'CONTROL',
    description: 'Lampu dimmer presisi dengan pengaturan kecerahan dan temperatur warna cahaya 2700K - 6500K.',
    icon: 'sliders',
    color: '#F59E0B',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'power',
        label: 'Daya Lampu',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status daya hidup (ON) atau mati (OFF)',
      },
      {
        property: 'brightness',
        label: 'Tingkat Kecerahan',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 70,
        controllable: true,
        description: 'Persentase intensitas kecerahan 0 - 100%',
      },
      {
        property: 'colorTemperature',
        label: 'Temperatur Warna',
        type: 'number',
        unit: 'K',
        min: 2700,
        max: 6500,
        step: 100,
        defaultValue: 4000,
        controllable: true,
        description: 'Temperatur warna Kelvin: Warm (2700K) hingga Cool White (6500K)',
      },
    ],
    defaultConfiguration: {
      power: true,
      brightness: 70,
      colorTemperature: 4000,
    },
  },

  // 15. AC Inverter Pintar (HVAC Control)
  {
    deviceType: 'SMART_AC',
    name: 'AC Inverter Pintar (HVAC Control)',
    category: 'CONTROL',
    description: 'Air Conditioner cerdas dengan pengatur target suhu, mode operasi, dan kecepatan kipas.',
    icon: 'wind',
    color: '#3B82F6',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'power',
        label: 'Daya AC',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status daya AC hidup (ON) atau mati (OFF)',
      },
      {
        property: 'targetTemperature',
        label: 'Target Suhu',
        type: 'number',
        unit: '°C',
        min: 16,
        max: 30,
        step: 1,
        defaultValue: 24,
        controllable: true,
        description: 'Target suhu ruangan yang diinginkan (16 - 30 °C)',
      },
      {
        property: 'mode',
        label: 'Mode Operasi',
        type: 'enum',
        options: ['COOL', 'HEAT', 'AUTO', 'FAN', 'DRY'],
        defaultValue: 'COOL',
        controllable: true,
        description: 'Mode pendinginan, pemanasan, sirkulasi udara, atau pengurangan kelembapan',
      },
      {
        property: 'fanSpeed',
        label: 'Kecepatan Kipas',
        type: 'enum',
        options: ['AUTO', 'LOW', 'MEDIUM', 'HIGH'],
        defaultValue: 'AUTO',
        controllable: true,
        description: 'Kecepatan hembusan kipas pendingin',
      },
      {
        property: 'currentTemperature',
        label: 'Suhu Ruangan Saat Ini',
        type: 'number',
        unit: '°C',
        min: 10,
        max: 45,
        defaultValue: 26,
        controllable: false,
        description: 'Pembacaan suhu ruangan terkini hasil pendinginan atau pemanasan AC',
      },
    ],
    defaultConfiguration: {
      power: true,
      targetTemperature: 24,
      currentTemperature: 26,
      mode: 'COOL',
      fanSpeed: 'AUTO',
    },
  },

  // 16. Kunci Pintu Digital Biometrik
  {
    deviceType: 'SMART_LOCK',
    name: 'Kunci Pintu Digital Biometrik',
    category: 'CONTROL',
    description: 'Kunci pintu digital otomatis dengan status penguncian, kontrol buka/kunci, dan auto-lock.',
    icon: 'lock',
    color: '#EF4444',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'lockState',
        label: 'Status Penguncian',
        type: 'enum',
        options: ['LOCKED', 'UNLOCKED'],
        defaultValue: 'LOCKED',
        controllable: true,
        description: 'Status kunci fisik: Terkunci (LOCKED) atau Terbuka (UNLOCKED)',
      },
      {
        property: 'autoLock',
        label: 'Kunci Otomatis (Auto-Lock)',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Mengunci kembali pintu secara otomatis setelah pintu tertutup rapat',
      },
      {
        property: 'autoLockDelaySeconds',
        label: 'Jeda Auto-Lock',
        type: 'number',
        unit: 's',
        min: 3,
        max: 300,
        defaultValue: 5,
        controllable: true,
        description: 'Jeda waktu sebelum grendel pintu otomatis mengunci (detik)',
      },
    ],
    defaultConfiguration: {
      lockState: 'LOCKED',
      autoLock: true,
      autoLockDelaySeconds: 5,
    },
  },

  // 17. Saklar Dinding Pintar (1–3 Gang)
  {
    deviceType: 'SMART_SWITCH',
    name: 'Saklar Dinding Pintar (1–3 Gang)',
    category: 'CONTROL',
    description: 'Saklar relai multi-gang di dinding untuk kontrol individual masing-masing jalur lampu.',
    icon: 'zap',
    color: '#8B5CF6',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'gang1',
        label: 'Jalur Lampu 1',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Kontrol hidup/mati untuk jalur lampu pertama',
      },
      {
        property: 'gang2',
        label: 'Jalur Lampu 2',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Kontrol hidup/mati untuk jalur lampu kedua',
      },
      {
        property: 'gang3',
        label: 'Jalur Lampu 3',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Kontrol hidup/mati untuk jalur lampu ketiga',
      },
      {
        property: 'power',
        label: 'Status Utama',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Status daya keseluruhan saklar',
      },
    ],
    defaultConfiguration: {
      gang1: false,
      gang2: false,
      gang3: false,
      power: false,
    },
  },

  // 18. Stopkontak Pintar (Smart Socket)
  {
    deviceType: 'SMART_PLUG',
    name: 'Stopkontak Pintar (Smart Socket)',
    category: 'CONTROL',
    description: 'Stopkontak pintar dengan pemutus arus jarak jauh dan pemantau watt konsumsi beban elektronik.',
    icon: 'zap',
    color: '#06B6D4',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'power',
        label: 'Daya Stopkontak',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status aliran listrik stopkontak hidup (ON) atau putus (OFF)',
      },
      {
        property: 'powerDrawWatts',
        label: 'Konsumsi Daya',
        type: 'number',
        unit: 'W',
        min: 0,
        max: 3600,
        defaultValue: 45,
        controllable: false,
        description: 'Beban daya yang sedang ditarik oleh perangkat elektronik tercolok',
      },
    ],
    defaultConfiguration: {
      power: true,
      powerDrawWatts: 45,
    },
  },

  // 19. Motor Penggerak Gorden / Tirai Jendela
  {
    deviceType: 'SMART_CURTAIN',
    name: 'Motor Penggerak Gorden / Tirai Jendela',
    category: 'CONTROL',
    description: 'Rel motorik penggerak tirai jendela dengan kontrol persentase bukaan dan tombol cepat.',
    icon: 'window',
    color: '#A855F7',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'position',
        label: 'Posisi Tirai',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 0,
        controllable: true,
        description: 'Persentase bukaan tirai: 0% (Tertutup Penuh) hingga 100% (Terbuka Penuh)',
      },
      {
        property: 'command',
        label: 'Aksi Cepat',
        type: 'enum',
        options: ['OPEN', 'CLOSE', 'STOP'],
        defaultValue: 'STOP',
        controllable: true,
        description: 'Perintah aksi cepat motor: Buka Penuh, Tutup Penuh, atau Berhenti',
      },
    ],
    defaultConfiguration: {
      position: 0,
      command: 'STOP',
    },
  },

  // 20. Kran / Katup Pipa Air Elektrik Otomatis
  {
    deviceType: 'SMART_WATER_VALVE',
    name: 'Kran / Katup Pipa Air Elektrik Otomatis',
    category: 'CONTROL',
    description: 'Kran motorik solenoid untuk menutup/membuka aliran air pipa utama dari HP saat darurat bocor.',
    icon: 'droplets',
    color: '#0284C7',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'valveState',
        label: 'Kondisi Katup Air',
        type: 'enum',
        options: ['OPEN', 'CLOSED'],
        defaultValue: 'OPEN',
        controllable: true,
        description: 'Kondisi katup pipa: Mengalir (OPEN) atau Tertutup (CLOSED)',
      },
      {
        property: 'power',
        label: 'Daya Valve',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status daya kontroler katup pipa air',
      },
    ],
    defaultConfiguration: {
      valveState: 'OPEN',
      power: true,
    },
  },

  // 21. Exhaust Fan Dapur & Kamar Mandi
  {
    deviceType: 'SMART_EXHAUST_FAN',
    name: 'Exhaust Fan Dapur & Kamar Mandi',
    category: 'CONTROL',
    description: 'Kipas exhaust plafon pengisap uap air dan bau dengan pengatur kecepatan dan timer.',
    icon: 'fan',
    color: '#14B8A6',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'power',
        label: 'Daya Kipas',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Status daya exhaust fan hidup (ON) atau mati (OFF)',
      },
      {
        property: 'speed',
        label: 'Kecepatan Kipas',
        type: 'enum',
        options: ['LOW', 'MEDIUM', 'HIGH'],
        defaultValue: 'MEDIUM',
        controllable: true,
        description: 'Kecepatan putaran bilah kipas sedot udara',
      },
    ],
    defaultConfiguration: {
      power: false,
      speed: 'MEDIUM',
    },
  },

  // 22. Sirine Alarm Audio & Strobo
  {
    deviceType: 'SMART_SIREN',
    name: 'Sirine Alarm Audio & Strobo',
    category: 'CONTROL',
    description: 'Sirine pengeras suara 105 dB dengan lampu strobo peringatan bahaya intrusi & kebakaran.',
    icon: 'bell',
    color: '#DC2626',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'siren',
        label: 'Bunyi Sirine',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Mengaktifkan (ON) atau mematikan (OFF) sirine darurat secara manual',
      },
      {
        property: 'volume',
        label: 'Tingkat Volume',
        type: 'enum',
        options: ['LOW', 'MEDIUM', 'HIGH'],
        defaultValue: 'HIGH',
        controllable: true,
        description: 'Intensitas desibel bunyi sirine',
      },
      {
        property: 'alarmType',
        label: 'Tipe Peringatan',
        type: 'enum',
        options: ['INTRUSION', 'FIRE', 'PANIC'],
        defaultValue: 'INTRUSION',
        controllable: true,
        description: 'Nada pola sirine yang dibunyikan',
      },
    ],
    defaultConfiguration: {
      siren: false,
      volume: 'HIGH',
      alarmType: 'INTRUSION',
    },
  },

  // =========================================================================
  // KATEGORI 3: VISUAL & MEDIA STREAMING (Menampilkan Visual / Kamera / Feed)
  // =========================================================================

  // 23. Kamera Pengawas Teras & Perimeter (2K/4K)
  {
    deviceType: 'OUTDOOR_CAMERA',
    name: 'Kamera Pengawas Teras & Perimeter (2K/4K)',
    category: 'VISUAL',
    description: 'Kamera IP outdoor tahan cuaca dengan lensa sudut lebar 130° FOV dan penglihatan malam inframerah.',
    icon: 'camera',
    color: '#3B82F6',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'streamStatus',
        label: 'Status Video Stream',
        type: 'enum',
        options: ['ONLINE', 'OFFLINE', 'STREAMING'],
        defaultValue: 'ONLINE',
        controllable: false,
        description: 'Kesiapan saluran streaming video langsung',
      },
      {
        property: 'nightVision',
        label: 'Mode Penglihatan Malam',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Mengaktifkan sensor IR night vision saat cahaya redup',
      },
      {
        property: 'storageMode',
        label: 'Penyimpanan Rekaman Kamera',
        type: 'enum',
        options: ['SD_CARD', 'CLOUD', 'NAS_NVR', 'DISABLED'],
        defaultValue: 'SD_CARD',
        controllable: true,
        description: 'Lokasi penyimpanan rekaman video (MicroSD Lokal, Cloud Terenkripsi, atau NAS/NVR)',
      },
      {
        property: 'recordingMode',
        label: 'Mode Perekaman',
        type: 'enum',
        options: ['MOTION_ONLY', 'CONTINUOUS', 'DISABLED'],
        defaultValue: 'MOTION_ONLY',
        controllable: true,
        description: 'Perekaman 24/7 terus menerus atau hanya saat mendeteksi gerakan',
      },
      {
        property: 'motionDetected',
        label: 'Terdeteksi Objek Bergerak',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Algoritma AI visual mendeteksi pergerakan manusia di zona kamera',
      },
    ],
    defaultConfiguration: {
      streamStatus: 'ONLINE',
      nightVision: true,
      storageMode: 'SD_CARD',
      recordingMode: 'MOTION_ONLY',
      motionDetected: false,
    },
  },

  // 24. Kamera Pengawas Indoor 360° (Pan-Tilt)
  {
    deviceType: 'INDOOR_CAMERA',
    name: 'Kamera Pengawas Indoor 360° (Pan-Tilt)',
    category: 'VISUAL',
    description: 'Kamera pengawas dalam ruangan dengan motor rotasi 360° horizontal dan pelacak gerakan otomatis.',
    icon: 'camera',
    color: '#6366F1',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'streamStatus',
        label: 'Status Video Stream',
        type: 'enum',
        options: ['ONLINE', 'OFFLINE', 'STREAMING'],
        defaultValue: 'ONLINE',
        controllable: false,
        description: 'Kesiapan saluran streaming video langsung',
      },
      {
        property: 'privacyMode',
        label: 'Mode Privasi (Shutter Tertutup)',
        type: 'boolean',
        defaultValue: false,
        controllable: true,
        description: 'Memutar lensa ke dalam bodi untuk privasi total penghuni saat berada di rumah',
      },
      {
        property: 'panAngle',
        label: 'Sudut Putar Horizontal',
        type: 'number',
        unit: '°',
        min: -180,
        max: 180,
        defaultValue: 0,
        controllable: true,
        description: 'Derajat sudut putar kamera horizontal',
      },
      {
        property: 'tiltAngle',
        label: 'Sudut Putar Vertikal',
        type: 'number',
        unit: '°',
        min: -45,
        max: 90,
        defaultValue: 15,
        controllable: true,
        description: 'Derajat sudut kemiringan kamera vertikal',
      },
      {
        property: 'nightVision',
        label: 'Mode Penglihatan Malam',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Mengaktifkan sensor IR night vision saat cahaya redup',
      },
      {
        property: 'storageMode',
        label: 'Penyimpanan Rekaman Kamera',
        type: 'enum',
        options: ['SD_CARD', 'CLOUD', 'NAS_NVR', 'DISABLED'],
        defaultValue: 'SD_CARD',
        controllable: true,
        description: 'Lokasi penyimpanan rekaman video (MicroSD Lokal, Cloud Terenkripsi, atau NAS/NVR)',
      },
    ],
    defaultConfiguration: {
      streamStatus: 'ONLINE',
      privacyMode: false,
      panAngle: 0,
      tiltAngle: 15,
      nightVision: true,
      storageMode: 'SD_CARD',
    },
  },

  // 25. Bel Pintu Video & Interkom Visual
  {
    deviceType: 'VIDEO_DOORBELL',
    name: 'Bel Pintu Video & Interkom Visual',
    category: 'VISUAL',
    description: 'Bel pintu pintar dengan kamera rasio 4:3 kepala-ke-kaki dan mikrofon bicara dua arah dengan tamu.',
    icon: 'camera',
    color: '#818CF8',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'streamStatus',
        label: 'Status Video Stream',
        type: 'enum',
        options: ['ONLINE', 'OFFLINE', 'STREAMING'],
        defaultValue: 'ONLINE',
        controllable: false,
        description: 'Kesiapan feed kamera depan pintu',
      },
      {
        property: 'doorbellPressed',
        label: 'Tombol Bel Ditekan',
        type: 'boolean',
        defaultValue: false,
        controllable: false,
        description: 'Sinyal panggilan tamu saat tombol fisik bel ditekan',
      },
      {
        property: 'batteryLevel',
        label: 'Level Baterai',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 92,
        controllable: false,
        description: 'Sisa kapasitas baterai bel pintu',
      },
      {
        property: 'nightVision',
        label: 'Mode Penglihatan Malam',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Mengaktifkan sensor IR night vision bel pintu',
      },
      {
        property: 'storageMode',
        label: 'Penyimpanan Rekaman Bel',
        type: 'enum',
        options: ['CLOUD', 'SD_CARD', 'DISABLED'],
        defaultValue: 'CLOUD',
        controllable: true,
        description: 'Penyimpanan klip video tamu saat bel ditekan',
      },
    ],
    defaultConfiguration: {
      streamStatus: 'ONLINE',
      doorbellPressed: false,
      batteryLevel: 92,
      nightVision: true,
      storageMode: 'CLOUD',
    },
  },

  // 26. Smart Display & Panel Interkom Dinding
  {
    deviceType: 'SMART_DISPLAY_HUB',
    name: 'Smart Display & Panel Interkom Dinding',
    category: 'VISUAL',
    description: 'Layar sentuh 10 inci di dinding untuk visualisasi denah interaktif, live CCTV, dan interkom kamar.',
    icon: 'monitor',
    color: '#4F46E5',
    defaultWidth: 48,
    defaultHeight: 48,
    capabilities: [
      {
        property: 'screenPower',
        label: 'Layar Menyala',
        type: 'boolean',
        defaultValue: true,
        controllable: true,
        description: 'Status layar sentuh dinding aktif atau screensaver',
      },
      {
        property: 'brightness',
        label: 'Kecerahan Layar',
        type: 'number',
        unit: '%',
        min: 0,
        max: 100,
        defaultValue: 80,
        controllable: true,
        description: 'Tingkat kecerahan display panel',
      },
      {
        property: 'activeView',
        label: 'Tampilan Utama',
        type: 'enum',
        options: ['FLOOR_PLAN', 'CAMERAS', 'SECURITY', 'WEATHER'],
        defaultValue: 'FLOOR_PLAN',
        controllable: true,
        description: 'Mode dashboard visual yang ditampilkan di layar dinding',
      },
    ],
    defaultConfiguration: {
      screenPower: true,
      brightness: 80,
      activeView: 'FLOOR_PLAN',
    },
  },
];

/**
 * Mapping legacy / short device types to canonical catalog device types
 */
export const DEVICE_TYPE_ALIASES: Record<string, string> = {
  // Lighting & Electrical
  LIGHT: 'SMART_LIGHT',
  DIMMER: 'SMART_DIMMER',
  SWITCH: 'SMART_SWITCH',
  SOCKET: 'SMART_PLUG',
  PLUG: 'SMART_PLUG',

  // Climate
  AC: 'SMART_AC',
  THERMOSTAT: 'SMART_AC',
  FAN: 'SMART_EXHAUST_FAN',

  // Security
  LOCK: 'SMART_LOCK',
  DOOR_SENSOR: 'DOOR_WINDOW_SENSOR',
  WINDOW_SENSOR: 'DOOR_WINDOW_SENSOR',
  SIREN: 'SMART_SIREN',

  // Sensors & Monitoring
  SENSOR: 'TEMP_HUMIDITY_SENSOR',
  TEMPERATURE_SENSOR: 'TEMP_HUMIDITY_SENSOR',
  AIR_QUALITY: 'AIR_QUALITY_SENSOR',
  MOTION_SENSOR: 'PIR_MOTION_SENSOR',
  PRESENCE: 'PRESENCE_RADAR_SENSOR',
  WATER_LEAK: 'WATER_LEAK_SENSOR',
  WATER_LEVEL: 'WATER_LEVEL_SENSOR',
  SMOKE_DETECTOR: 'SMOKE_FIRE_SENSOR',
  GAS_DETECTOR: 'GAS_LEAK_SENSOR',
  ENERGY: 'ENERGY_MONITOR',

  // Actuators
  CURTAIN: 'SMART_CURTAIN',
  VALVE: 'SMART_WATER_VALVE',

  // Visual
  CAMERA: 'OUTDOOR_CAMERA',
  SECURITY_CAMERA: 'OUTDOOR_CAMERA',
  DOORBELL: 'VIDEO_DOORBELL',
  DISPLAY: 'SMART_DISPLAY_HUB',
};

/**
 * Resolve canonical device catalog definition by deviceType or legacy alias
 */
export function getCatalogDefinitionByType(deviceType: string): DeviceCatalogDefinition | null {
  const normalized = (deviceType || '').toUpperCase().trim();
  const canonical = DEVICE_TYPE_ALIASES[normalized] || normalized;
  return IOT_DEVICE_CATALOG.find((d) => d.deviceType === canonical) || null;
}

/**
 * Validate a device configuration update against the device's capability definitions.
 */
export function validateDeviceConfiguration(
  capabilities: DeviceCapability[],
  configuration: Record<string, any>,
  isControlAction = false
): { isValid: boolean; errors: string[]; validatedConfig: Record<string, any> } {
  const errors: string[] = [];
  const validatedConfig: Record<string, any> = {};

  if (!configuration || typeof configuration !== 'object') {
    return { isValid: false, errors: ['Konfigurasi harus berupa object JSON yang valid.'], validatedConfig: {} };
  }

  const capMap = new Map<string, DeviceCapability>();
  capabilities.forEach((cap) => capMap.set(cap.property, cap));

  // System metadata & multimedia telemetry keys that should not be rejected
  const IGNORED_METADATA_KEYS = new Set([
    'status',
    'id',
    'deviceId',
    'isControlAction',
    'action',
    'commandType',
    'timestamp',
    'integrationStatus',
    'providerType',
    'isLocked',
    // Video streaming, storage & camera telemetry
    'streamUrl',
    'resolution',
    'fps',
    'codec',
    'bitrateKbps',
    'cameraPreset',
    'streamProtocol',
    'aiDetectionLabel',
    'signalStrengthDbm',
    'ptzCapable',
    'twoWayAudio',
    'sdCardStatus',
    'sdCardCapacityGb',
    'cloudPlan',
    // Floor plan CAD presentation
    'labelPosition',
  ]);

  for (const [key, value] of Object.entries(configuration)) {
    if (IGNORED_METADATA_KEYS.has(key)) {
      validatedConfig[key] = value;
      continue;
    }

    const cap = capMap.get(key);

    if (!cap) {
      if (isControlAction) {
        errors.push(`Property '${key}' tidak dikenali dalam kemampuan perangkat ini.`);
      } else {
        // In configuration persistence, preserve custom/extended configuration
        validatedConfig[key] = value;
      }
      continue;
    }

    if (isControlAction && !cap.controllable) {
      errors.push(`Property '${key}' (${cap.label}) bersifat read-only dan tidak dapat dikontrol.`);
      continue;
    }

    // Type validation
    if (cap.type === 'boolean') {
      if (typeof value !== 'boolean') {
        errors.push(`Nilai untuk '${key}' harus berupa boolean (true/false).`);
        continue;
      }
      validatedConfig[key] = value;
    } else if (cap.type === 'number') {
      const num = Number(value);
      if (typeof value !== 'number' || isNaN(num)) {
        errors.push(`Nilai untuk '${key}' harus berupa angka numerik valid.`);
        continue;
      }
      if (cap.min !== undefined && num < cap.min) {
        errors.push(`Nilai untuk '${key}' tidak boleh kurang dari batas minimum ${cap.min}${cap.unit ? ' ' + cap.unit : ''}.`);
        continue;
      }
      if (cap.max !== undefined && num > cap.max) {
        errors.push(`Nilai untuk '${key}' tidak boleh melebihi batas maksimum ${cap.max}${cap.unit ? ' ' + cap.unit : ''}.`);
        continue;
      }
      validatedConfig[key] = num;
    } else if (cap.type === 'enum') {
      if (typeof value !== 'string') {
        errors.push(`Nilai untuk '${key}' harus berupa string.`);
        continue;
      }
      const upperVal = value.toUpperCase();
      if (!cap.options || !cap.options.includes(upperVal)) {
        errors.push(`Nilai '${value}' untuk '${key}' tidak valid. Pilihan yang didukung: ${cap.options?.join(', ')}.`);
        continue;
      }
      validatedConfig[key] = upperVal;
    } else if (cap.type === 'string') {
      if (typeof value !== 'string') {
        errors.push(`Nilai untuk '${key}' harus berupa teks string.`);
        continue;
      }
      validatedConfig[key] = value;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedConfig,
  };
}
