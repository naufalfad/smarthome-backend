import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response.js';
import {
  getSystemHealth,
  getFullHealth,
  getReadiness,
  getWorkersHealth,
} from '../services/health.service.js';
import { checkDatabaseConnection } from '../services/db.service.js';

export const getHealth = (_req: Request, res: Response): Response => {
  const systemInfo = getSystemHealth();
  // In production, return minimal non-sensitive status on public health endpoint
  const safePayload =
    process.env.NODE_ENV === 'production'
      ? {
          service: systemInfo.service,
          status: systemInfo.status,
          uptimeSeconds: systemInfo.uptimeSeconds,
        }
      : systemInfo;

  return sendSuccess(
    res,
    'Smart Home 3D API is running',
    safePayload,
    200
  );
};

export const getLiveness = (_req: Request, res: Response): Response => {
  return res.status(200).json({
    status: 'live',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

export const getReadinessStatus = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  const readiness = await getReadiness();
  const statusCode = readiness.isReady ? 200 : 503;
  return res.status(statusCode).json({
    status: readiness.isReady ? 'ready' : 'not_ready',
    data: readiness,
  });
};

export const getWorkersStatus = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  const workers = await getWorkersHealth();
  return sendSuccess(res, 'Worker diagnostics retrieved', workers, 200);
};

export const getFullHealthStatus = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  const health = await getFullHealth();
  const statusCode = health.database.isConnected ? 200 : 200; // Return 200 with degraded state so client can inspect
  return sendSuccess(
    res,
    health.database.isConnected
      ? 'All systems operational'
      : 'API is running; Database connection pending configuration',
    health,
    statusCode
  );
};

export const getDatabaseHealth = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  const dbStatus = await checkDatabaseConnection();
  return sendSuccess(
    res,
    dbStatus.message,
    dbStatus,
    dbStatus.isConnected ? 200 : 503
  );
};

