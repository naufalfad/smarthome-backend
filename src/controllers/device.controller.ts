import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.service.js';
import { DeviceService } from '../services/device.service.js';
import { DeviceManagementService } from '../services/device-management.service.js';
import { HouseService } from '../services/house.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export async function listFloorPlanDevices(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.floorPlanId as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, floorPlanId, { requireActive: true });
    const devices = await DeviceService.listDevicesByFloorPlan(floorPlanId);
    res.json({
      success: true,
      data: devices,
    });
  } catch (err) {
    next(err);
  }
}

export async function createDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.floorPlanId as string;
    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
      include: { floor: { select: { houseId: true } } },
    });
    if (!plan || !plan.floor) {
      throw new AppError('Denah lantai tidak ditemukan.', 404);
    }

    if (req.user?.role === 'TECHNICIAN') {
      const isAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
        req.user.technicianProfileId,
        plan.floor.houseId
      );
      if (!isAssigned) {
        throw new AppError(
          'Akses dilarang: Teknisi belum memiliki penugasan aktif pada properti ini.',
          403
        );
      }
    } else if (req.user?.role !== 'SUPER_ADMIN') {
      throw new AppError(
        'Akses dilarang: Hanya Super Admin atau Teknisi bertugas yang dapat menempatkan perangkat baru.',
        403
      );
    }

    // Check package quota if house is linked to a confirmed ServiceOrder
    const quota = await HouseService.getHouseQuota(plan.floor.houseId);
    if (quota.maxDevices !== null && quota.currentDevices >= quota.maxDevices) {
      throw new AppError(
        `Batas kuota perangkat untuk paket layanan ini telah tercapai (maksimal ${quota.maxDevices} perangkat).`,
        400
      );
    }

    const device = await DeviceService.createDevice(floorPlanId, req.body);
    res.status(201).json({
      success: true,
      message: 'Perangkat berhasil ditempatkan pada denah',
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const device = await DeviceService.getDeviceById(id);
    res.json({
      success: true,
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditDevice(req.user, id);
    const updated = await DeviceService.updateDevice(id, req.body);
    res.json({
      success: true,
      message: 'Konfigurasi perangkat berhasil diperbarui',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditDevice(req.user, id);
    await DeviceService.deleteDevice(id);
    res.json({
      success: true,
      message: 'Perangkat berhasil dihapus dari denah',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDeviceConfiguration(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const { configuration, isControlAction } = req.body;
    const updated = await DeviceService.updateDeviceConfiguration(
      id,
      configuration || req.body,
      isControlAction !== undefined ? isControlAction : true
    );
    res.json({
      success: true,
      message: 'Konfigurasi perangkat berhasil diperbarui',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateTelemetry(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Akses dilarang: Hanya Super Admin yang dapat memutakhirkan telemetri langsung.', 403);
    }
    const id = req.params.id as string;
    const { status, configuration } = req.body;
    const updated = await DeviceService.updateTelemetry(id, status, configuration);
    res.json({
      success: true,
      message: 'Status simulasi perangkat diperbarui',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// PHASE 6: STANDARDIZED COMMANDS & PROVIDER LAYER
// ==========================================

export async function executeStandardizedCommand(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const { commandType, payload, action } = req.body;

    const result = await DeviceManagementService.executeCommand(id, {
      commandType: commandType || action,
      payload: payload || req.body,
      action,
    });

    res.json({
      success: true,
      message: 'Perintah perangkat berhasil dieksekusi melalui provider',
      data: result,
    });
  } catch (err: any) {
    const statusCode = err instanceof AppError ? err.statusCode : 400;
    res.status(statusCode).json({
      success: false,
      message: err.message || 'Gagal mengeksekusi perintah perangkat',
    });
  }
}

export async function getDeviceCommandHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const history = await DeviceManagementService.getDeviceCommandHistory(id, limit);

    res.json({
      success: true,
      data: history,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceProviderState(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessDevice(req.user, id, { requireActive: true });
    const state = await DeviceManagementService.getDeviceStateWithProvider(id);

    res.json({
      success: true,
      data: state,
    });
  } catch (err) {
    next(err);
  }
}

export async function listFloorPlanDevicesEnriched(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.floorPlanId as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, floorPlanId, { requireActive: true });
    const result = await DeviceManagementService.getFloorPlanDevicesWithProvider(floorPlanId);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
