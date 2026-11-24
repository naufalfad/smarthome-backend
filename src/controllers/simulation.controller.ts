import { Request, Response, NextFunction } from 'express';
import { SimulationService } from '../simulation/simulation.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export async function getEngineStatus(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Akses dilarang: Hanya Super Admin yang dapat melihat status mesin simulasi.', 403);
    }
    const status = SimulationService.getEngineStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceState(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const state = await SimulationService.getLatestState(id);
    res.json({
      success: true,
      data: state,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceTelemetry(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const metricType = req.query.metricType as string | undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    const telemetry = await SimulationService.getTelemetryHistory(id, {
      limit,
      metricType,
      since,
    });

    res.json({
      success: true,
      data: telemetry,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFloorPlanTelemetry(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = (req.params.floorPlanId || req.params.id) as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, floorPlanId, { requireActive: true });
    const result = await SimulationService.getFloorPlanLatestTelemetry(floorPlanId);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function controlDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const result = await SimulationService.executeDeviceControl(id, req.body);
    res.json({
      success: true,
      message: 'Perintah kontrol perangkat berhasil diproses',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
