import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { prisma } from '../services/db.service.js';

/**
 * Resolves houseId safely without any global fallback.
 * Validates ownership and state-gated access (requireActive: true) for Customers.
 */
async function resolveDashboardHouseId(req: Request): Promise<string> {
  const user = req.user;
  const rawHouseId = typeof req.query.houseId === 'string' ? req.query.houseId.trim() : undefined;

  if (rawHouseId) {
    await PropertyAccessPolicy.assertCanAccessProperty(user, rawHouseId, { requireActive: true });
    return rawHouseId;
  }

  // houseId was omitted
  if (!user || !user.role) {
    throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
  }

  if (user.role === 'CUSTOMER') {
    if (!user.customerProfileId) {
      throw new AppError('Akses dilarang: Akun Anda tidak memiliki profil pelanggan aktif.', 403);
    }
    const ownedHouses = await prisma.house.findMany({
      where: { customerId: user.customerProfileId },
      select: { id: true, setupStatus: true },
    });

    if (ownedHouses.length === 0) {
      throw new AppError('Pelanggan belum memiliki properti terdaftar.', 404);
    }

    if (ownedHouses.length === 1) {
      if (ownedHouses[0].setupStatus !== 'ACTIVE') {
        throw new AppError(
          `Akses dilarang: Properti belum berstatus ACTIVE (status saat ini: ${ownedHouses[0].setupStatus}). Data operasional hanya dapat diakses setelah serah terima selesai.`,
          403
        );
      }
      return ownedHouses[0].id;
    }

    if (ownedHouses.length > 1) {
      const err = new AppError(
        "Pelanggan memiliki beberapa properti. Parameter 'houseId' wajib dipilih secara eksplisit.",
        400
      );
      (err as any).multiple_properties_detected = true;
      (err as any).properties = ownedHouses;
      throw err;
    }
  }

  throw new AppError("Parameter 'houseId' wajib disertakan.", 400);
}

export class DashboardController {
  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const data = await DashboardService.getOverview(resolvedHouseId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getFloors(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const data = await DashboardService.getFloors(resolvedHouseId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getRooms(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const floorId = req.query.floorId as string | undefined;

      if (floorId) {
        const floor = await prisma.floor.findUnique({
          where: { id: floorId },
          select: { houseId: true },
        });
        if (!floor || floor.houseId !== resolvedHouseId) {
          throw new AppError(
            `Injeksi ditolak: Lantai '${floorId}' tidak terdaftar pada properti ini.`,
            400
          );
        }
      }

      const data = await DashboardService.getRooms(resolvedHouseId, floorId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getDevices(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const floorId = req.query.floorId as string | undefined;
      const roomId = req.query.roomId as string | undefined;
      const category = req.query.category as string | undefined;

      if (floorId) {
        const floor = await prisma.floor.findUnique({
          where: { id: floorId },
          select: { houseId: true },
        });
        if (!floor || floor.houseId !== resolvedHouseId) {
          throw new AppError(
            `Injeksi ditolak: Lantai '${floorId}' tidak terdaftar pada properti ini.`,
            400
          );
        }
      }

      if (roomId) {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          select: { floorRel: { select: { houseId: true } } },
        });
        if (!room || room.floorRel?.houseId !== resolvedHouseId) {
          throw new AppError(
            `Injeksi ditolak: Ruangan '${roomId}' tidak terdaftar pada properti ini.`,
            400
          );
        }
      }

      const data = await DashboardService.getDevices(resolvedHouseId, floorId, roomId, category);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getActivities(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
      const data = await DashboardService.getActivities(resolvedHouseId, limit);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAutomationSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const resolvedHouseId = await resolveDashboardHouseId(req);
      const data = await DashboardService.getAutomationSummary(resolvedHouseId);
      res.json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async controlDevice(req: Request, res: Response, next: NextFunction) {
    try {
      const deviceId = req.params.deviceId as string;
      const { commandType, action, payload } = req.body;
      const actualType = commandType || action;

      if (!actualType) {
        return res.status(400).json({
          success: false,
          message: 'Parameter commandType atau action wajib diisi',
        });
      }

      // Assert device access and verify property active status for Customer
      await PropertyAccessPolicy.assertCanAccessDevice(req.user, deviceId, { requireActive: true });

      const result = await DashboardService.controlDevice(deviceId, actualType, payload);
      res.json({
        success: true,
        message: 'Perintah perangkat berhasil dieksekusi',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
