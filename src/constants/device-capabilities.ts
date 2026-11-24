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

export interface DeviceCatalogDefinition {
  deviceType: string;
  name: string;
  category: 'LIGHTING' | 'CLIMATE' | 'SECURITY' | 'SENSORS';
  description: string;
  icon: string;
  color: string;
  defaultWidth: number;
  defaultHeight: number;
  capabilities: DeviceCapability[];
  defaultConfiguration: Record<string, any>;
}

export const IOT_DEVICE_CATALOG: DeviceCatalogDefinition[] = [
  // 1. Smart Light
  {
    deviceType: 'SMART_LIGHT',
    name: 'Smart Light',
    category: 'LIGHTING',
    description: 'Lampu cerdas dengan kontrol daya dan pengaturan tingkat kecerahan.',
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

  // 2. Smart Dimmer Light
  {
    deviceType: 'SMART_DIMMER',
    name: 'Smart Dimmer Light',
    category: 'LIGHTING',
    description: 'Lampu dimmer presisi dengan pengaturan kecerahan dan temperatur warna cahaya.',
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

  // 3. Smart AC
  {
    deviceType: 'SMART_AC',
    name: 'Smart AC',
    category: 'CLIMATE',
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
        controllable: false, // Telemetri pemantauan suhu lingkungan dari AC
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

  // 4. Smart Door Lock
  {
    deviceType: 'SMART_LOCK',
    name: 'Smart Door Lock',
    category: 'SECURITY',
    description: 'Kunci pintu digital otomatis dengan status penguncian dan fitur auto-lock.',
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
        description: 'Mengunci kembali pintu secara otomatis setelah durasi tertentu',
      },
    ],
    defaultConfiguration: {
      lockState: 'LOCKED',
      autoLock: true,
    },
  },

  // 5. Temperature & Humidity Sensor
  {
    deviceType: 'TEMP_HUMIDITY_SENSOR',
    name: 'Temperature & Humidity Sensor',
    category: 'SENSORS',
    description: 'Sensor pemantau suhu dan kelembapan lingkungan ruangan secara berkala (Read-Only).',
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
        controllable: false, // READ-ONLY SENSOR
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
        controllable: false, // READ-ONLY SENSOR
        description: 'Pembacaan kelembapan relatif udara saat ini dalam persen',
      },
    ],
    defaultConfiguration: {
      temperature: 25.5,
      humidity: 58,
    },
  },

  // 6. Air Quality Sensor
  {
    deviceType: 'AIR_QUALITY_SENSOR',
    name: 'Air Quality Sensor',
    category: 'SENSORS',
    description: 'Sensor pendeteksi indeks kualitas udara (AQI), partikel halus PM2.5, dan debu PM10 (Read-Only).',
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
        defaultValue: 38,
        controllable: false, // READ-ONLY SENSOR
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
        controllable: false, // READ-ONLY SENSOR
        description: 'Konsentrasi partikel debu halus berukuran <= 2.5 mikrometer',
      },
      {
        property: 'pm10',
        label: 'Partikel PM10',
        type: 'number',
        unit: 'µg/m³',
        min: 0,
        max: 1000,
        defaultValue: 22,
        controllable: false, // READ-ONLY SENSOR
        description: 'Konsentrasi partikel debu berukuran <= 10 mikrometer',
      },
    ],
    defaultConfiguration: {
      aqi: 38,
      pm25: 12,
      pm10: 22,
    },
  },
];

/**
 * Mapping legacy / short device types to canonical catalog device types
 */
export const DEVICE_TYPE_ALIASES: Record<string, string> = {
  LIGHT: 'SMART_LIGHT',
  DIMMER: 'SMART_DIMMER',
  AC: 'SMART_AC',
  THERMOSTAT: 'SMART_AC',
  LOCK: 'SMART_LOCK',
  SENSOR: 'TEMP_HUMIDITY_SENSOR',
  TEMPERATURE_SENSOR: 'TEMP_HUMIDITY_SENSOR',
  AIR_QUALITY: 'AIR_QUALITY_SENSOR',
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
 * @param capabilities List of capabilities defined for this device type
 * @param configuration The payload of properties to validate
 * @param isControlAction Whether this update comes from a user control action (enforces controllable: true)
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

  // System metadata keys that should not be validated as device hardware capabilities
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
  ]);

  for (const [key, value] of Object.entries(configuration)) {
    if (IGNORED_METADATA_KEYS.has(key)) {
      continue;
    }

    const cap = capMap.get(key);

    if (!cap) {
      errors.push(`Property '${key}' tidak dikenali dalam kemampuan perangkat ini.`);
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

