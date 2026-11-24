import { SimulationEngineStatus } from './simulation.types.js';

export type SimulationTickHandler = (tickNumber: number) => Promise<{
  devicesProcessed: number;
  errors: string[];
}>;

export class SimulationScheduler {
  private static instance: SimulationScheduler | null = null;

  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isTicking: boolean = false;
  private startedAt: Date | null = null;
  private lastTickAt: Date | null = null;
  private totalTicks: number = 0;
  private devicesProcessed: number = 0;
  private lastTickDurationMs: number = 0;
  private lastErrorCount: number = 0;
  private recentErrors: string[] = [];

  private intervalMs: number = 5000;
  private tickHandler: SimulationTickHandler | null = null;

  private constructor() {
    const envInterval = process.env.SIMULATION_INTERVAL_MS;
    if (envInterval) {
      const parsed = parseInt(envInterval, 10);
      if (!isNaN(parsed) && parsed >= 1000) {
        this.intervalMs = parsed;
      }
    }
  }

  public static getInstance(): SimulationScheduler {
    if (!SimulationScheduler.instance) {
      SimulationScheduler.instance = new SimulationScheduler();
    }
    return SimulationScheduler.instance;
  }

  public registerTickHandler(handler: SimulationTickHandler): void {
    this.tickHandler = handler;
  }

  public start(): void {
    if (this.isRunning) {
      console.log('⚡ [SimulationScheduler] Already running, skipping duplicate start request.');
      return;
    }

    if (!this.tickHandler) {
      throw new Error('Cannot start SimulationScheduler without a registered tickHandler');
    }

    this.isRunning = true;
    this.startedAt = new Date();
    this.totalTicks = 0;
    this.recentErrors = [];

    console.log(`🚀 [SimulationScheduler] Background IoT Engine started (Interval: ${this.intervalMs}ms)`);

    // Run first tick after brief delay
    setTimeout(() => {
      this.executeTick();
    }, 1000);

    // Schedule regular ticks
    this.timer = setInterval(() => {
      this.executeTick();
    }, this.intervalMs);
  }

  public stop(): void {
    if (!this.isRunning) return;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.isRunning = false;
    console.log('🛑 [SimulationScheduler] Background IoT Engine stopped gracefully.');
  }

  private async executeTick(): Promise<void> {
    if (!this.isRunning || this.isTicking || !this.tickHandler) {
      return;
    }

    this.isTicking = true;
    const startTime = Date.now();
    this.totalTicks++;

    try {
      const result = await this.tickHandler(this.totalTicks);
      this.devicesProcessed = result.devicesProcessed;
      this.lastErrorCount = result.errors.length;

      if (result.errors.length > 0) {
        this.recentErrors = [...result.errors, ...this.recentErrors].slice(0, 10);
      }
    } catch (err: any) {
      console.error('❌ [SimulationScheduler] Unhandled error during simulation tick:', err);
      this.lastErrorCount++;
      this.recentErrors = [err.message || 'Unknown tick error', ...this.recentErrors].slice(0, 10);
    } finally {
      this.lastTickDurationMs = Date.now() - startTime;
      this.lastTickAt = new Date();
      this.isTicking = false;
    }
  }

  public getStatus(): SimulationEngineStatus {
    const uptimeSeconds = this.startedAt
      ? Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
      : 0;

    return {
      isRunning: this.isRunning,
      startedAt: this.startedAt ? this.startedAt.toISOString() : null,
      uptimeSeconds,
      lastTickAt: this.lastTickAt ? this.lastTickAt.toISOString() : null,
      totalTicks: this.totalTicks,
      devicesProcessed: this.devicesProcessed,
      lastTickDurationMs: this.lastTickDurationMs,
      intervalMs: this.intervalMs,
      lastErrorCount: this.lastErrorCount,
      recentErrors: this.recentErrors,
    };
  }
}

