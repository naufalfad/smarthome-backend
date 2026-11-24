import { prisma } from './db.service.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import {
  StandardizedDeviceCommand,
  StandardizedCommandType,
  DeviceCommandResult,
  DeviceProviderState,
} from '../providers/device-provider.types.js';

export interface StandardizedCommandRequest {
  commandType: StandardizedCommandType | string;
  payload?: Record<string, any>;
  action?: string; // Backwards-compatible action parameter
}

/**
 * PHASE 6: DEVICE MANAGEMENT LAYER
 * Central orchestrator managing device identities, commands, telemetry, and provider dispatch.
 */
export class DeviceManagementService {
  private static registry = DeviceProviderRegistry.getInstance();

  /**
   * Executes a standardized command onto an IoT device through its registered provider.
   * Full command lifecycle tracking: PENDING -> PROCESSING -> SUCCESS / FAILED.
   */
  static async executeCommand(
    deviceId: string,
    request: StandardizedCommandRequest
  ): Promise<{
    commandId: string;
    status: 'SUCCESS' | 'FAILED';
    commandType: string;
    appliedConfig?: Record<string, any>;
    resultingStatus?: string;
    errorMessage?: string;
    device?: any;
  }> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { catalogItem: true },
    });

    if (!device) {
      throw new Error(`Device with id '${deviceId}' not found.`);
    }

    // 1. Normalize commandType from either commandType or legacy action
    let commandType = request.commandType;
    let payload = request.payload || {};

    if (!commandType && request.action) {
      commandType = request.action;
    }

    if (!commandType) {
      throw new Error('Command execution requires a valid commandType or action');
    }

    // 2. Persist initial command record with status PENDING
    const commandRecord = await prisma.deviceCommand.create({
      data: {
        deviceId,
        commandType,
        payload,
        status: 'PENDING',
      },
    });

    try {
      // 3. Transition to PROCESSING
      await prisma.deviceCommand.update({
        where: { id: commandRecord.id },
        data: { status: 'PROCESSING' },
      });

      // 4. Resolve provider via registry (Strict: throws if provider is missing or unsupported)
      const provider = this.registry.getProviderForDevice(device);

      const standardizedCommand: StandardizedDeviceCommand = {
        id: commandRecord.id,
        deviceId,
        commandType,
        payload,
        timestamp: commandRecord.createdAt,
      };

      // 5. Delegate command execution to the resolved provider with 15s safety timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Command '${commandType}' timed out after 15000ms`)),
          15000
        );
      });

      const result: DeviceCommandResult = await Promise.race([
        provider.executeCommand(deviceId, standardizedCommand),
        timeoutPromise,
      ]);

      // 6. On success: update command record to SUCCESS
      await prisma.deviceCommand.update({
        where: { id: commandRecord.id },
        data: {
          status: 'SUCCESS',
          executionResult: result.appliedConfig,
          completedAt: result.completedAt || new Date(),
        },
      });

      // Update device lastSeenAt
      const updatedDevice = await prisma.device.update({
        where: { id: deviceId },
        data: {
          lastSeenAt: new Date(),
          connectionStatus: 'ONLINE',
        },
        include: {
          room: true,
          floor: true,
          catalogItem: true,
        },
      });

      return {
        commandId: commandRecord.id,
        status: 'SUCCESS',
        commandType,
        appliedConfig: result.appliedConfig,
        resultingStatus: result.resultingStatus,
        device: updatedDevice,
      };
    } catch (err: any) {
      const errMsg = err.message || 'Unknown command execution error';

      // 7. On error: record FAILED in command lifecycle
      await prisma.deviceCommand.update({
        where: { id: commandRecord.id },
        data: {
          status: 'FAILED',
          errorMessage: errMsg,
          completedAt: new Date(),
        },
      });

      throw new Error(`Eksekusi perintah '${commandType}' gagal: ${errMsg}`);
    }
  }

  /**
   * Retrieves command lifecycle history for a device
   */
  static async getDeviceCommandHistory(deviceId: string, limit: number = 20) {
    const take = Math.min(100, Math.max(1, limit));
    return prisma.deviceCommand.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  /**
   * Retrieves enriched device state with provider details, connection status, and last seen
   */
  static async getDeviceStateWithProvider(deviceId: string): Promise<DeviceProviderState> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { catalogItem: true },
    });

    if (!device) {
      throw new Error(`Device with id '${deviceId}' not found.`);
    }

    try {
      const provider = this.registry.getProviderForDevice(device);
      return provider.getDeviceState(deviceId);
    } catch (providerErr: any) {
      // If provider is missing/unavailable, report OFFLINE or UNKNOWN state without fallback
      const latestTelemetry = await prisma.deviceTelemetry.findFirst({
        where: { deviceId },
        orderBy: { timestamp: 'desc' },
      });

      return {
        deviceId: device.id,
        providerType: device.providerType || 'UNKNOWN',
        connectionStatus: 'OFFLINE',
        status: device.status,
        configuration: (device.configuration as Record<string, any>) || {},
        lastSeenAt: latestTelemetry?.timestamp || device.lastSeenAt || device.updatedAt,
        isSimulated: device.providerType === 'VIRTUAL',
        metadata: {
          error: providerErr.message,
          dataSource: device.providerType === 'VIRTUAL' ? 'SIMULATION' : 'UNAVAILABLE_HARDWARE',
        },
      };
    }
  }

  /**
   * Enriches bulk floor plan devices with provider metadata, connection status, and telemetry
   */
  static async getFloorPlanDevicesWithProvider(floorPlanId: string) {
    const devices = await prisma.device.findMany({
      where: { floorPlanId },
      include: {
        catalogItem: true,
        room: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const deviceIds = devices.map((d) => d.id);
    const recentReadings = await prisma.deviceTelemetry.findMany({
      where: { deviceId: { in: deviceIds } },
      distinct: ['deviceId', 'metricType'],
      orderBy: [
        { deviceId: 'asc' },
        { metricType: 'asc' },
        { timestamp: 'desc' },
      ],
    });

    const readingsByDevice: Record<string, any[]> = {};
    for (const r of recentReadings) {
      if (!readingsByDevice[r.deviceId]) {
        readingsByDevice[r.deviceId] = [];
      }
      readingsByDevice[r.deviceId].push(r);
    }

    const providerStatuses = this.registry.getAllStatuses();

    return {
      providers: providerStatuses,
      devices: devices.map((dev) => {
        let isOnline = false;
        try {
          const provider = this.registry.getProviderForDevice(dev);
          isOnline = provider.getStatus().isRunning;
        } catch {
          isOnline = false;
        }

        return {
          id: dev.id,
          name: dev.name,
          type: dev.type,
          status: dev.status,
          integrationStatus: dev.integrationStatus,
          providerType: dev.providerType || 'VIRTUAL',
          connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
          lastSeenAt: dev.lastSeenAt || dev.updatedAt,
          isSimulated: (dev.providerType || 'VIRTUAL') === 'VIRTUAL',
          dataSource: (dev.providerType || 'VIRTUAL') === 'VIRTUAL' ? 'SIMULATION' : 'HARDWARE',
          configuration: dev.configuration,
          iconWidth: dev.iconWidth,
          iconHeight: dev.iconHeight,
          normalizedX: dev.normalizedX,
          normalizedY: dev.normalizedY,
          x: dev.x,
          y: dev.y,
          manualRoomName: dev.manualRoomName,
          room: dev.room,
          catalogItem: dev.catalogItem,
          latestTelemetry: readingsByDevice[dev.id] || [],
        };
      }),
    };
  }

  /**
   * Recovers dangling commands that remained in PENDING or PROCESSING states
   * when server crashed, restarted, or experienced an unhandled network partition.
   */
  static async recoverDanglingCommands(maxAgeMinutes: number = 5): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    const { count } = await prisma.deviceCommand.updateMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'FAILED',
        errorMessage: 'Eksekusi perintah terputus akibat restart server atau waktu tunggu habis (timeout).',
        completedAt: new Date(),
      },
    });

    return count;
  }
}

