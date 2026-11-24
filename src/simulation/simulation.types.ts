export interface SimulationEngineStatus {
  isRunning: boolean;
  startedAt: string | null;
  uptimeSeconds: number;
  lastTickAt: string | null;
  totalTicks: number;
  devicesProcessed: number;
  lastTickDurationMs: number;
  intervalMs: number;
  lastErrorCount: number;
  recentErrors: string[];
}

export interface TelemetryDataPoint {
  metricType: string;
  value?: number | null;
  unit?: string | null;
  stringValue?: string | null;
  data?: Record<string, any> | null;
}

export interface DeviceSimulationResult {
  deviceId: string;
  status: string;
  configuration: Record<string, any>;
  telemetryRecords: TelemetryDataPoint[];
}

export interface SimulationContext {
  tickNumber: number;
  timestamp: Date;
  allDevices: any[];
}

export interface IDeviceProcessor {
  canProcess(deviceType: string): boolean;
  processTick(device: any, context: SimulationContext): Promise<DeviceSimulationResult | null>;
}

