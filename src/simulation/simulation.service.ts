import { prisma } from '../services/db.service.js';
import { SimulationEngine } from './simulation.engine.js';
import { SimulationEngineStatus } from './simulation.types.js';
import {
  DeviceCapability,
  validateDeviceConfiguration,
  getCatalogDefinitionByType,
} from '../constants/device-capabilities.js';
import { DeviceCatalogService } from '../services/device-catalog.service.js';
import { DeviceManagementService } from '../services/device-management.service.js';

export class SimulationService {
  /**
   * Retrieves background engine health & operational status
   */
  static getEngineStatus(): SimulationEngineStatus {
    return SimulationEngine.getInstance().getStatus();
  }

  /**
   * Retrieves latest state and telemetry for a single device
   */
  static async getLatestState(deviceId: string) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        catalogItem: true,
        room: true,
        floor: true,
      },
    });

    if (!device) {
      throw new Error(`Device with id '${deviceId}' not found.`);
    }

    // Get latest telemetry point
    const latestTelemetry = await prisma.deviceTelemetry.findFirst({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
    });

    return {
      id: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      integrationStatus: device.integrationStatus,
      configuration: device.configuration,
      lastReadingAt: latestTelemetry?.timestamp || device.updatedAt,
      isSimulated: device.integrationStatus === 'SIMULATED',
      device,
    };
  }

  /**
   * Retrieves telemetry history for a device within optional timeframe and metric filters
   */
  static async getTelemetryHistory(
    deviceId: string,
    options: {
      limit?: number;
      metricType?: string;
      since?: Date;
    } = {}
  ) {
    const limit = Math.min(200, Math.max(1, options.limit || 50));

    const where: any = { deviceId };
    if (options.metricType) {
      where.metricType = options.metricType;
    }
    if (options.since) {
      where.timestamp = { gte: options.since };
    }

    return prisma.deviceTelemetry.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  /**
   * Fast bulk fetch of latest telemetry and states for all devices on a floor plan
   */
  static async getFloorPlanLatestTelemetry(floorPlanId: string) {
    const devices = await prisma.device.findMany({
      where: { floorPlanId },
      include: {
        catalogItem: true,
        room: true,
      },
    });

    // Efficiently get latest readings per device
    const deviceIds = devices.map((d) => d.id);
    const recentReadings = await prisma.deviceTelemetry.findMany({
      where: {
        deviceId: { in: deviceIds },
      },
      distinct: ['deviceId', 'metricType'],
      orderBy: [
        { deviceId: 'asc' },
        { metricType: 'asc' },
        { timestamp: 'desc' },
      ],
    });

    // Group telemetry by deviceId
    const readingsByDevice: Record<string, any[]> = {};
    for (const r of recentReadings) {
      if (!readingsByDevice[r.deviceId]) {
        readingsByDevice[r.deviceId] = [];
      }
      readingsByDevice[r.deviceId].push(r);
    }

    const engineStatus = SimulationEngine.getInstance().getStatus();

    return {
      engine: {
        isRunning: engineStatus.isRunning,
        intervalMs: engineStatus.intervalMs,
        lastTickAt: engineStatus.lastTickAt,
      },
      devices: devices.map((dev) => ({
        id: dev.id,
        name: dev.name,
        type: dev.type,
        status: dev.status,
        integrationStatus: dev.integrationStatus,
        configuration: dev.configuration,
        updatedAt: dev.updatedAt,
        latestTelemetry: readingsByDevice[dev.id] || [],
      })),
    };
  }

  /**
   * Executes a validated control command onto an IoT device via DeviceManagementService (Phase 6)
   */
  static async executeDeviceControl(
    deviceId: string,
    command: {
      action?: string;
      property?: string;
      value?: any;
      payload?: any;
    }
  ) {
    let commandType = command.action || 'CUSTOM';
    let payload = command.payload ? { ...command.payload } : {};
    if (command.property !== undefined && command.value !== undefined) {
      payload[command.property] = command.value;
      if (command.property === 'power') {
        commandType = 'SET_POWER';
      } else if (command.property === 'brightness') {
        commandType = 'SET_BRIGHTNESS';
      } else if (command.property === 'targetTemperature') {
        commandType = 'SET_TEMPERATURE';
      } else {
        commandType = 'SET_CONFIG';
      }
    }

    const res = await DeviceManagementService.executeCommand(deviceId, {
      commandType,
      payload,
      action: command.action,
    });

    return res.device;
  }
}

