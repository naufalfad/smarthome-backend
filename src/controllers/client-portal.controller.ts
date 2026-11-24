import { Request, Response, NextFunction } from 'express';
import { ClientPortalService } from '../services/client-portal.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { prisma } from '../services/db.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export async function getClientDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId, { requireActive: true });
    const data = await ClientPortalService.getClientDashboard(houseId);
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
}

export async function controlDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    const deviceId = req.params.deviceId as string;
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId, { requireActive: true });

    // Validate that the device actually belongs to this specific property (cross-property prevention)
    const device = await prisma.device.findFirst({
      where: { id: deviceId, houseId },
    });
    if (!device) {
      throw new AppError(`Perangkat '${deviceId}' tidak terdaftar pada properti '${houseId}'.`, 404);
    }

    const updated = await ClientPortalService.controlDevice(houseId, deviceId, req.body);
    res.json({
      success: true,
      message: 'Perintah perangkat berhasil dieksekusi',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}
