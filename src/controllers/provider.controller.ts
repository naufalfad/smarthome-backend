import { Request, Response, NextFunction } from 'express';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';

export async function getProviderStatuses(_req: Request, res: Response, next: NextFunction) {
  try {
    const statuses = DeviceProviderRegistry.getInstance().getAllStatuses();
    res.json({
      success: true,
      data: statuses,
    });
  } catch (err) {
    next(err);
  }
}

export async function getProviderHealth(_req: Request, res: Response, next: NextFunction) {
  try {
    const health = await DeviceProviderRegistry.getInstance().getOverallHealth();
    res.json({
      success: true,
      data: health,
    });
  } catch (err) {
    next(err);
  }
}

