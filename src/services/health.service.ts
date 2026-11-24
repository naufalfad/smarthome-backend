import os from 'os';
import { checkDatabaseConnection, DbConnectionStatus } from './db.service.js';
import { config } from '../config/env.js';
import { SimulationEngine } from '../simulation/simulation.engine.js';
import { AutomationEngine } from '../automation/automation.engine.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  environment: string;
  nodeVersion: string;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
  };
  system: {
    platform: string;
    cpus: number;
  };
}

export const getSystemHealth = (): HealthStatus => {
  const memory = process.memoryUsage();
  return {
    service: 'smart-home-3d-api',
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.nodeEnv,
    nodeVersion: process.version,
    memoryUsageMb: {
      rss: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
      heapTotal: Math.round((memory.heapTotal / 1024 / 1024) * 100) / 100,
      heapUsed: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
    },
    system: {
      platform: `${os.platform()} (${os.arch()})`,
      cpus: os.cpus().length,
    },
  };
};

export const getWorkersHealth = async () => {
  const simStatus = SimulationEngine.getInstance().getStatus();

  let autoStatus: any = { isRunning: false };
  try {
    autoStatus = await AutomationEngine.getInstance().getStatus();
  } catch (err: any) {
    autoStatus = { isRunning: false, error: err.message };
  }

  const providerStatuses = DeviceProviderRegistry.getInstance().getAllStatuses();

  return {
    simulationEngine: simStatus,
    automationEngine: autoStatus,
    deviceProviders: providerStatuses,
  };
};

export const getReadiness = async (): Promise<{
  isReady: boolean;
  database: DbConnectionStatus;
  workers: any;
}> => {
  const database = await checkDatabaseConnection();
  const workers = await getWorkersHealth();

  const isReady =
    database.isConnected &&
    (workers.simulationEngine.isRunning ?? true) &&
    (workers.automationEngine.isRunning ?? true);

  return {
    isReady,
    database,
    workers,
  };
};

export const getFullHealth = async (): Promise<{
  system: HealthStatus;
  database: DbConnectionStatus;
  workers?: any;
}> => {
  const system = getSystemHealth();
  const database = await checkDatabaseConnection();
  const workers = await getWorkersHealth();

  return {
    system,
    database,
    workers,
  };
};

