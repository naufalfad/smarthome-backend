import { prisma } from '../services/db.service.js';
import { SimulationScheduler } from './simulation.scheduler.js';
import {
  IDeviceProcessor,
  SimulationContext,
  SimulationEngineStatus,
} from './simulation.types.js';
import {
  SmartLightProcessor,
  SmartAcProcessor,
  SmartLockProcessor,
  TempHumiditySensorProcessor,
  AirQualitySensorProcessor,
  SwitchSocketProcessor,
  DefaultDeviceProcessor,
} from './simulation.device-processor.js';

export class SimulationEngine {
  private static instance: SimulationEngine | null = null;
  private scheduler: SimulationScheduler;
  private processors: IDeviceProcessor[] = [];
  private isInitialized: boolean = false;

  private constructor() {
    this.scheduler = SimulationScheduler.getInstance();

    // Register processors in priority order
    this.processors = [
      new SmartLightProcessor(),
      new SmartAcProcessor(),
      new SmartLockProcessor(),
      new TempHumiditySensorProcessor(),
      new AirQualitySensorProcessor(),
      new SwitchSocketProcessor(),
      new DefaultDeviceProcessor(), // Fallback
    ];

    this.setupScheduler();
    this.setupGracefulShutdown();
  }

  public static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  private setupScheduler(): void {
    this.scheduler.registerTickHandler(async (tickNumber: number) => {
      return this.handleTick(tickNumber);
    });
  }

  private setupGracefulShutdown(): void {
    const handleShutdown = (signal: string) => {
      console.log(`\n🛑 [SimulationEngine] Received ${signal}. Shutting down IoT background engine...`);
      this.stop();
    };

    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  }

  public start(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.scheduler.start();
  }

  public stop(): void {
    this.scheduler.stop();
    this.isInitialized = false;
  }

  public getStatus(): SimulationEngineStatus {
    return this.scheduler.getStatus();
  }

  /**
   * Manually trigger a simulation tick (e.g. for testing or on-demand tick)
   */
  public async executeTick(tickNumber: number = 1): Promise<{
    devicesProcessed: number;
    errors: string[];
  }> {
    return this.handleTick(tickNumber);
  }

  /**
   * Data retention strategy: deletes telemetry older than cutoff (default: 24 hours)
   */
  public async pruneTelemetry(cutoff?: Date): Promise<number> {
    const targetCutoff = cutoff || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await prisma.deviceTelemetry.deleteMany({
      where: {
        timestamp: { lt: targetCutoff },
      },
    });
    if (count > 0) {
      console.log(`🧹 [SimulationEngine] Pruned ${count} old telemetry records (>24h).`);
    }
    return count;
  }

  /**
   * Main simulation tick execution
   */
  private async handleTick(tickNumber: number): Promise<{
    devicesProcessed: number;
    errors: string[];
  }> {
    const timestamp = new Date();
    const errors: string[] = [];

    // 1. Fetch all active simulated devices
    const devices = await prisma.device.findMany({
      where: {
        integrationStatus: {
          in: ['SIMULATED', 'UNCONFIGURED', 'ONLINE'],
        },
      },
      include: {
        catalogItem: true,
      },
    });

    if (devices.length === 0) {
      return { devicesProcessed: 0, errors: [] };
    }

    const context: SimulationContext = {
      tickNumber,
      timestamp,
      allDevices: devices,
    };

    const telemetryToInsert: Array<{
      deviceId: string;
      metricType: string;
      value: number | null;
      unit: string | null;
      stringValue: string | null;
      data: any;
      isSimulated: boolean;
      timestamp: Date;
    }> = [];

    let processedCount = 0;

    // 2. Process each device with error isolation
    for (const device of devices) {
      try {
        const processor = this.processors.find((p) => p.canProcess(device.type));
        if (!processor) continue;

        const result = await processor.processTick(device, context);
        if (!result) continue;

        // Persist latest state & configuration
        await prisma.device.update({
          where: { id: device.id },
          data: {
            status: result.status,
            configuration: result.configuration,
            integrationStatus: 'SIMULATED',
          },
        });

        // Queue telemetry points
        if (result.telemetryRecords && result.telemetryRecords.length > 0) {
          for (const t of result.telemetryRecords) {
            telemetryToInsert.push({
              deviceId: device.id,
              metricType: t.metricType,
              value: t.value !== undefined ? t.value : null,
              unit: t.unit ?? null,
              stringValue: t.stringValue ?? null,
              data: t.data ?? null,
              isSimulated: true,
              timestamp,
            });
          }
        }

        processedCount++;
      } catch (devErr: any) {
        const errMsg = `Device ${device.id} (${device.name}): ${devErr.message || 'Processing failed'}`;
        console.warn(`⚠️ [SimulationEngine] ${errMsg}`);
        errors.push(errMsg);
      }
    }

    // 3. Batch insert telemetry points
    if (telemetryToInsert.length > 0) {
      try {
        await prisma.deviceTelemetry.createMany({
          data: telemetryToInsert,
        });
      } catch (telErr: any) {
        console.error('❌ [SimulationEngine] Failed to batch insert telemetry:', telErr);
        errors.push(`Telemetry batch insert error: ${telErr.message}`);
      }
    }

    // 4. Periodic Telemetry Retention Pruning (Every 60 ticks)
    if (tickNumber % 60 === 0) {
      this.pruneOldTelemetry().catch((pruneErr) => {
        console.warn('⚠️ [SimulationEngine] Retention pruning error:', pruneErr);
      });
    }

    return {
      devicesProcessed: processedCount,
      errors,
    };
  }

  /**
   * Data retention strategy: deletes telemetry older than 24 hours to keep DB lean and fast
   */
  private async pruneOldTelemetry(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await prisma.deviceTelemetry.deleteMany({
      where: {
        timestamp: { lt: cutoff },
      },
    });
    if (count > 0) {
      console.log(`🧹 [SimulationEngine] Pruned ${count} old telemetry records (>24h).`);
    }
  }
}
