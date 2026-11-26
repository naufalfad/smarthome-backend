import {
  DeviceSimulationResult,
  IDeviceProcessor,
  SimulationContext,
  TelemetryDataPoint,
} from './simulation.types.js';
import {
  calculateClimateConvergence,
  calculateAmbientDrift,
  generateAirQualityMetrics,
  brownianDrift,
  roundTo,
} from './simulation.generators.js';

/**
 * 1. Smart Light & Dimmer Processor
 */
export class SmartLightProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return (
      t === 'SMART_LIGHT' ||
      t === 'LIGHT' ||
      t === 'SMART_DIMMER' ||
      t === 'AUTO_DUSK_DAWN_LIGHT' ||
      t === 'AUTO_PIR_NIGHT_LIGHT'
    );
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const isPowerOn = config.power ?? (device.status === 'ON');
    const brightness = typeof config.brightness === 'number' ? config.brightness : 100;

    const nextConfig = {
      ...config,
      power: isPowerOn,
      brightness,
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'power',
        value: isPowerOn ? 1 : 0,
        stringValue: isPowerOn ? 'ON' : 'OFF',
        unit: 'state',
      },
    ];

    if (isPowerOn) {
      telemetry.push({
        metricType: 'brightness',
        value: brightness,
        unit: '%',
      });
    }

    return {
      deviceId: device.id,
      status: isPowerOn ? 'ON' : 'OFF',
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 2. Smart AC & Climate Processor
 */
export class SmartAcProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return t === 'SMART_AC' || t === 'AC' || t === 'THERMOSTAT';
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const isPowerOn = config.power ?? (device.status === 'ON');
    const targetTemp = typeof config.targetTemperature === 'number' ? config.targetTemperature : 24.0;
    const currentTemp = typeof config.currentTemperature === 'number' ? config.currentTemperature : 28.5;
    const mode = (config.mode || 'COOL').toUpperCase() as 'COOL' | 'HEAT' | 'AUTO' | 'FAN' | 'DRY';
    const fanSpeed = (config.fanSpeed || 'AUTO').toUpperCase();

    const speedMultipliers: Record<string, number> = {
      LOW: 0.6,
      MEDIUM: 0.9,
      HIGH: 1.3,
      AUTO: 1.0,
    };
    const multiplier = speedMultipliers[fanSpeed] || 1.0;

    let nextCurrentTemp = currentTemp;
    if (isPowerOn) {
      nextCurrentTemp = calculateClimateConvergence(currentTemp, targetTemp, mode, multiplier);
    } else {
      nextCurrentTemp = calculateAmbientDrift(currentTemp, 29.0);
    }

    const nextConfig = {
      ...config,
      power: isPowerOn,
      targetTemperature: targetTemp,
      currentTemperature: nextCurrentTemp,
      mode,
      fanSpeed,
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'temperature',
        value: nextCurrentTemp,
        unit: '°C',
        data: {
          currentTemperature: nextCurrentTemp,
          targetTemperature: targetTemp,
          mode,
          isPowerOn,
        },
      },
      {
        metricType: 'power',
        value: isPowerOn ? 1 : 0,
        stringValue: isPowerOn ? 'ON' : 'OFF',
      },
    ];

    if (isPowerOn) {
      telemetry.push({
        metricType: 'targetTemperature',
        value: targetTemp,
        unit: '°C',
      });
      telemetry.push({
        metricType: 'mode',
        stringValue: mode,
      });
    }

    return {
      deviceId: device.id,
      status: isPowerOn ? 'ON' : 'OFF',
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 3. Smart Door Lock Processor
 */
export class SmartLockProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return t === 'SMART_LOCK' || t === 'LOCK';
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const isLocked = config.lockState !== undefined ? config.lockState === 'LOCKED' : (device.status !== 'UNLOCKED');
    const lockState = isLocked ? 'LOCKED' : 'UNLOCKED';

    const nextConfig = {
      ...config,
      lockState,
      isLocked,
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'lockState',
        stringValue: lockState,
        value: isLocked ? 1 : 0,
        unit: 'state',
      },
    ];

    return {
      deviceId: device.id,
      status: lockState,
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 4. Temperature & Humidity Sensor Processor
 */
export class TempHumiditySensorProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return t === 'TEMP_HUMIDITY_SENSOR' || t === 'SENSOR';
  }

  async processTick(device: any, context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};

    // Check if there is an active AC nearby on the same floor/room
    let ambientTarget = 26.5;
    const allDevices = context.allDevices || (context as any).activeDevices || [];
    const floorAC = allDevices.find(
      (d: any) =>
        d.id !== device.id &&
        (d.floorId === device.floorId || (device.roomId && d.roomId === device.roomId)) &&
        (d.type?.toUpperCase().includes('AC') || d.type?.toUpperCase().includes('THERMOSTAT')) &&
        (d.configuration?.power === true || d.status === 'ON')
    );

    if (floorAC?.configuration?.currentTemperature) {
      ambientTarget = floorAC.configuration.currentTemperature;
    }

    const currentTemp = typeof config.temperature === 'number' ? config.temperature : 25.5;
    const currentHumidity = typeof config.humidity === 'number' ? config.humidity : 58.0;

    // Smooth subtle micro-variations
    const nextTemp = brownianDrift(currentTemp, 18.0, 36.0, 0.08, ambientTarget, 0.05);
    const nextHumidity = brownianDrift(currentHumidity, 42.0, 78.0, 0.35, 56.0, 0.03);

    const nextConfig = {
      ...config,
      temperature: roundTo(nextTemp, 1),
      humidity: roundTo(nextHumidity, 1),
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'temperature',
        value: roundTo(nextTemp, 1),
        unit: '°C',
      },
      {
        metricType: 'humidity',
        value: roundTo(nextHumidity, 1),
        unit: '%',
      },
    ];

    return {
      deviceId: device.id,
      status: 'ONLINE',
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 5. Air Quality Sensor Processor
 */
export class AirQualitySensorProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return t === 'AIR_QUALITY_SENSOR';
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const currentAqi = typeof config.aqi === 'number' ? config.aqi : 35;

    const metrics = generateAirQualityMetrics(currentAqi);

    const nextConfig = {
      ...config,
      aqi: metrics.aqi,
      pm25: metrics.pm25,
      pm10: metrics.pm10,
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'aqi',
        value: metrics.aqi,
        unit: 'AQI',
      },
      {
        metricType: 'pm25',
        value: metrics.pm25,
        unit: 'µg/m³',
      },
      {
        metricType: 'pm10',
        value: metrics.pm10,
        unit: 'µg/m³',
      },
    ];

    return {
      deviceId: device.id,
      status: 'ONLINE',
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 6. Switch & Socket Processor
 */
export class SwitchSocketProcessor implements IDeviceProcessor {
  canProcess(type: string): boolean {
    const t = type.toUpperCase();
    return (
      t === 'SWITCH' ||
      t === 'SOCKET' ||
      t === 'SMART_SWITCH' ||
      t === 'SMART_PLUG' ||
      t === 'SMART_WATER_VALVE' ||
      t === 'SMART_SIREN' ||
      t === 'ENERGY_MONITOR'
    );
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const isPowerOn = config.power ?? (device.status === 'ON');

    const nextConfig: Record<string, any> = {
      ...config,
      power: isPowerOn,
    };

    const telemetry: TelemetryDataPoint[] = [
      {
        metricType: 'power',
        value: isPowerOn ? 1 : 0,
        stringValue: isPowerOn ? 'ON' : 'OFF',
        unit: 'state',
      },
    ];

    if (isPowerOn && device.type?.toUpperCase() === 'SOCKET') {
      // Simulate realistic active appliance power draw (35W - 75W)
      const currentPowerDraw = typeof config.powerDrawWatts === 'number' ? config.powerDrawWatts : 45;
      const nextPowerDraw = Math.round(brownianDrift(currentPowerDraw, 20, 90, 2.0, 48, 0.05));
      nextConfig.powerDrawWatts = nextPowerDraw;
      telemetry.push({
        metricType: 'powerDrawWatts',
        value: nextPowerDraw,
        unit: 'W',
      });
    }

    return {
      deviceId: device.id,
      status: isPowerOn ? 'ON' : 'OFF',
      configuration: nextConfig,
      telemetryRecords: telemetry,
    };
  }
}

/**
 * 7. Default / Passthrough Processor for Other IoT Devices (Fan, Camera, Sensors, etc.)
 */
export class DefaultDeviceProcessor implements IDeviceProcessor {
  canProcess(_type: string): boolean {
    return true; // Fallback
  }

  async processTick(device: any, _context: SimulationContext): Promise<DeviceSimulationResult> {
    const config = (device.configuration as Record<string, any>) || {};
    const status = device.status || 'ONLINE';

    return {
      deviceId: device.id,
      status,
      configuration: config,
      telemetryRecords: [
        {
          metricType: 'status',
          stringValue: status,
          unit: 'state',
        },
      ],
    };
  }
}
