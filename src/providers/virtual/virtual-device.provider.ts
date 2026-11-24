import { prisma } from '../../services/db.service.js';
import {
  IDeviceProvider,
  ProviderType,
  DeviceProviderState,
  StandardizedDeviceCommand,
  DeviceCommandResult,
  ProviderStatus,
  ProviderHealthCheck,
} from '../device-provider.types.js';
import { SimulationEngine } from '../../simulation/simulation.engine.js';
import {
  DeviceCapability,
  validateDeviceConfiguration,
} from '../../constants/device-capabilities.js';
import { DeviceCatalogService } from '../../services/device-catalog.service.js';

/**
 * Concrete Virtual Device Provider (Phase 6)
 * Wraps the Phase 5 Background IoT Simulation Engine to manage all simulated devices.
 */
export class VirtualDeviceProvider implements IDeviceProvider {
  public readonly providerType: ProviderType = 'VIRTUAL';
  public readonly name = 'Virtual Device Simulation Provider';
  public readonly isHardware = false;

  private isInitialized = false;
  private startedAt: Date | null = null;
  private simulationEngine: SimulationEngine;

  constructor() {
    this.simulationEngine = SimulationEngine.getInstance();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('⚡ [VirtualDeviceProvider] Initialized successfully with SimulationEngine');
  }

  public async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    this.simulationEngine.start();
    this.startedAt = new Date();
    console.log('🚀 [VirtualDeviceProvider] Virtual device background simulation started');
  }

  public async stop(): Promise<void> {
    this.simulationEngine.stop();
    this.startedAt = null;
    console.log('🛑 [VirtualDeviceProvider] Virtual device background simulation stopped');
  }

  /**
   * Retrieves state, configuration, and connectivity for a simulated device
   */
  public async getDeviceState(deviceId: string): Promise<DeviceProviderState> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        catalogItem: true,
      },
    });

    if (!device) {
      throw new Error(`[VirtualDeviceProvider] Device with id '${deviceId}' not found.`);
    }

    const latestTelemetry = await prisma.deviceTelemetry.findFirst({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
    });

    const isRunning = this.simulationEngine.getStatus().isRunning;
    const connectionStatus = isRunning ? 'ONLINE' : 'OFFLINE';
    const lastSeen = latestTelemetry?.timestamp || device.lastSeenAt || device.updatedAt;

    return {
      deviceId: device.id,
      providerType: this.providerType,
      connectionStatus,
      status: device.status,
      configuration: (device.configuration as Record<string, any>) || {},
      lastSeenAt: lastSeen,
      isSimulated: true,
      metadata: {
        typeName: device.type,
        catalogName: device.catalogItem?.name,
        dataSource: 'SIMULATION',
      },
    };
  }

  /**
   * Executes a standardized command onto a virtual device with capability enforcement
   */
  public async executeCommand(
    deviceId: string,
    command: StandardizedDeviceCommand
  ): Promise<DeviceCommandResult> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { catalogItem: true },
    });

    if (!device) {
      throw new Error(`[VirtualDeviceProvider] Device with id '${deviceId}' not found.`);
    }

    // Resolve capabilities
    const capabilities: DeviceCapability[] =
      (device.catalogItem?.capabilities as unknown as DeviceCapability[]) ||
      (await DeviceCatalogService.getCapabilitiesByType(device.type));

    const currentConfig = (device.configuration as Record<string, any>) || {};
    let updatesToApply: Record<string, any> = {};

    // 1. Normalize standardized commands to device configuration properties
    switch (command.commandType) {
      case 'SET_POWER':
        updatesToApply.power =
          command.payload?.power !== undefined
            ? Boolean(command.payload.power)
            : command.payload?.status === 'ON';
        break;

      case 'TOGGLE_POWER': {
        const isCurrentlyOn = currentConfig.power ?? (device.status === 'ON');
        updatesToApply.power = !isCurrentlyOn;
        break;
      }

      case 'SET_BRIGHTNESS':
        if (command.payload?.brightness === undefined) {
          throw new Error('Command SET_BRIGHTNESS requires payload.brightness number');
        }
        updatesToApply.brightness = Number(command.payload.brightness);
        break;

      case 'SET_TEMPERATURE': {
        const target =
          command.payload?.targetTemperature ??
          command.payload?.value ??
          command.payload?.temperature;
        if (target === undefined) {
          throw new Error('Command SET_TEMPERATURE requires payload.targetTemperature number');
        }
        updatesToApply.targetTemperature = Number(target);
        break;
      }

      case 'SET_MODE':
        if (!command.payload?.mode) {
          throw new Error('Command SET_MODE requires payload.mode');
        }
        updatesToApply.mode = String(command.payload.mode).toUpperCase();
        break;

      case 'SET_FAN_SPEED':
        if (!command.payload?.fanSpeed) {
          throw new Error('Command SET_FAN_SPEED requires payload.fanSpeed');
        }
        updatesToApply.fanSpeed = String(command.payload.fanSpeed).toUpperCase();
        break;

      case 'LOCK':
        updatesToApply.lockState = 'LOCKED';
        break;

      case 'UNLOCK':
        updatesToApply.lockState = 'UNLOCKED';
        break;

      case 'TOGGLE_LOCK': {
        const currentLock = currentConfig.lockState ?? (device.status === 'LOCKED' ? 'LOCKED' : 'UNLOCKED');
        updatesToApply.lockState = currentLock === 'LOCKED' ? 'UNLOCKED' : 'LOCKED';
        break;
      }

      case 'SET_CONFIG':
      case 'CUSTOM':
      default:
        if (command.payload && typeof command.payload === 'object') {
          updatesToApply = { ...command.payload };

          // Normalize boolean/status values
          if (typeof updatesToApply.power === 'string') {
            updatesToApply.power = updatesToApply.power === 'ON';
          }
          if (updatesToApply.power === undefined && updatesToApply.status !== undefined) {
            if (capabilities.some((c) => c.property === 'power')) {
              updatesToApply.power = updatesToApply.status === 'ON';
            }
          }
          if (updatesToApply.lockState === undefined) {
            if (updatesToApply.isLocked !== undefined) {
              updatesToApply.lockState = updatesToApply.isLocked ? 'LOCKED' : 'UNLOCKED';
            } else if (updatesToApply.status === 'LOCKED' || updatesToApply.status === 'UNLOCKED') {
              updatesToApply.lockState = updatesToApply.status;
            }
          }

          // Strip metadata keys so capability validation succeeds
          delete updatesToApply.status;
          delete updatesToApply.id;
          delete updatesToApply.deviceId;
          delete updatesToApply.isControlAction;
          delete updatesToApply.action;
          delete updatesToApply.commandType;
          delete updatesToApply.isLocked;
        }
        break;
    }

    // 2. Validate against device capabilities (Strictly rejects control on read-only sensors!)
    if (capabilities && capabilities.length > 0) {
      const validation = validateDeviceConfiguration(capabilities, updatesToApply, true);
      if (!validation.isValid) {
        throw new Error(`[VirtualDeviceProvider] Perintah ditolak kapabilitas: ${validation.errors.join('; ')}`);
      }
      updatesToApply = validation.validatedConfig;
    }

    // 3. Derive runtime high-level status
    let nextStatus = device.status;
    if (updatesToApply.power !== undefined) {
      nextStatus = updatesToApply.power ? 'ON' : 'OFF';
    }
    if (updatesToApply.lockState !== undefined) {
      nextStatus = updatesToApply.lockState;
    }

    const mergedConfig = {
      ...currentConfig,
      ...updatesToApply,
    };

    const now = new Date();

    // 4. Persist updated configuration, status, and connection status
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: nextStatus,
        configuration: mergedConfig,
        connectionStatus: 'ONLINE',
        lastSeenAt: now,
      },
    });

    // 5. Instantly record a standardized telemetry checkpoint
    const checkpointInserts: any[] = [];
    for (const [prop, val] of Object.entries(updatesToApply)) {
      checkpointInserts.push({
        deviceId,
        metricType: prop,
        value: typeof val === 'number' ? val : typeof val === 'boolean' ? (val ? 1 : 0) : null,
        stringValue: typeof val === 'string' ? val : typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : null,
        providerType: this.providerType,
        isSimulated: true,
        timestamp: now,
      });
    }

    if (checkpointInserts.length > 0) {
      try {
        await prisma.deviceTelemetry.createMany({
          data: checkpointInserts,
        });
      } catch (err) {
        console.warn('⚠️ [VirtualDeviceProvider] Failed to record control checkpoint telemetry:', err);
      }
    }

    return {
      commandId: command.id || `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      deviceId,
      status: 'SUCCESS',
      appliedConfig: mergedConfig,
      resultingStatus: nextStatus,
      completedAt: now,
    };
  }

  public getStatus(): ProviderStatus {
    const engineStatus = this.simulationEngine.getStatus();
    return {
      providerType: this.providerType,
      name: this.name,
      isInitialized: this.isInitialized,
      isRunning: engineStatus.isRunning,
      isHardware: false,
      managedDevicesCount: engineStatus.devicesProcessed,
      activeErrors: engineStatus.lastErrorCount,
      lastError: engineStatus.recentErrors?.[0] || null,
      startedAt: this.startedAt,
      metadata: {
        intervalMs: engineStatus.intervalMs,
        totalTicks: engineStatus.totalTicks,
        lastTickAt: engineStatus.lastTickAt,
      },
    };
  }

  public async healthCheck(): Promise<ProviderHealthCheck> {
    try {
      const isRunning = this.simulationEngine.getStatus().isRunning;
      return {
        providerType: this.providerType,
        isHealthy: true,
        message: isRunning
          ? 'Virtual Device Provider operating normally via Simulation Engine'
          : 'Virtual Device Provider initialized but simulation engine is paused',
        timestamp: new Date(),
        details: {
          engineStatus: this.simulationEngine.getStatus(),
        },
      };
    } catch (err: any) {
      return {
        providerType: this.providerType,
        isHealthy: false,
        message: `Health check failed: ${err.message}`,
        timestamp: new Date(),
      };
    }
  }
}
