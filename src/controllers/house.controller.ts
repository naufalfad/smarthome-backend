import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { HouseService } from '../services/house.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import {
  SURVEYS_DIR,
  sanitizeStorageFilename,
  resolveHouseSurveyPhotoPath,
  isPathContained,
  streamFileSecurely,
} from '../utils/storage-path.util.js';

export async function getHouses(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    if (user.role === 'SUPER_ADMIN') {
      const customerId =
        typeof req.query.customerId === 'string' && req.query.customerId.trim()
          ? req.query.customerId.trim()
          : undefined;
      const houses = await HouseService.listHouses(customerId ? { customerId } : undefined);
      return res.json({ success: true, data: houses });
    }

    if (user.role === 'CUSTOMER') {
      if (!user.customerProfileId) {
        throw new AppError('Akses dilarang: Profil pelanggan tidak ditemukan.', 403);
      }
      // If customer specifies query customerId that does not match their own ID -> reject 403
      if (req.query.customerId && req.query.customerId !== user.customerProfileId) {
        throw new AppError('Akses dilarang: Anda tidak dapat melihat properti milik pelanggan lain.', 403);
      }
      const houses = await HouseService.listHouses({ customerId: user.customerProfileId });
      return res.json({ success: true, data: houses });
    }

    if (user.role === 'TECHNICIAN') {
      if (!user.technicianProfileId) {
        return res.json({ success: true, data: [] });
      }
      const houses = await HouseService.listHousesForTechnician(user.technicianProfileId);
      return res.json({ success: true, data: houses });
    }

    return res.json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
}

export async function getHouseById(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId);
    const house = await HouseService.getHouseById(houseId);
    if (!house) {
      return res.status(404).json({ success: false, message: 'House not found' });
    }
    res.json({ success: true, data: house });
  } catch (err) {
    next(err);
  }
}

export async function createHouse(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    // Phase 0 Decision 4 & Phase 4 Rule: Customers cannot create standalone properties
    if (user.role === 'CUSTOMER') {
      throw new AppError(
        'Akses dilarang: Pelanggan tidak dapat membuat properti secara mandiri. Properti didaftarkan melalui pemesanan paket layanan.',
        403
      );
    }

    if (user.role === 'TECHNICIAN') {
      throw new AppError('Akses dilarang: Teknisi tidak memiliki hak untuk membuat properti baru.', 403);
    }

    const { name, description, address, propertyType, hasPhysicalIot, customerId } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'House name is required' });
    }

    const house = await HouseService.createHouse({
      name: name.trim(),
      description: description?.trim(),
      address: typeof address === 'string' ? address.trim() : undefined,
      propertyType,
      hasPhysicalIot: typeof hasPhysicalIot === 'boolean' ? hasPhysicalIot : undefined,
      customerId: typeof customerId === 'string' && customerId.trim() ? customerId.trim() : undefined,
    });
    res.status(201).json({ success: true, data: house });
  } catch (err) {
    next(err);
  }
}

export async function addFloor(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Akses dilarang: Hanya Super Admin yang dapat menambahkan lantai.', 403);
    }

    const { name, levelNumber } = req.body;
    const floor = await HouseService.addFloor(req.params.id as string, {
      name: name?.trim(),
      levelNumber: levelNumber ? parseInt(levelNumber, 10) : undefined,
    });
    res.status(201).json({ success: true, data: floor });
  } catch (err) {
    next(err);
  }
}

export async function deleteFloor(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (user?.role !== 'SUPER_ADMIN') {
      throw new AppError('Akses dilarang: Hanya Super Admin yang dapat menghapus lantai.', 403);
    }

    const house = await HouseService.deleteFloor(
      req.params.id as string,
      req.params.floorId as string
    );
    res.json({
      success: true,
      message: 'Lantai berhasil dihapus',
      data: house,
    });
  } catch (err) {
    next(err);
  }
}

export async function getInternalSurveys(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessInternalSurvey(req.user, houseId);
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId);
    res.json({
      success: true,
      data: {
        houseId,
        surveys: [],
        message: 'Catatan survei internal berhasil diambil.',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function streamSurveyPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    const rawFilename = req.params.filename as string;

    // 1. Mandatory survey authorization checks (Customer is always denied 403, Technician requires assignment)
    await PropertyAccessPolicy.assertCanAccessInternalSurvey(req.user, houseId);
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId);

    // 2. Strict filename sanitization against path traversal, encoded traversals, and null bytes
    const safeFilename = sanitizeStorageFilename(rawFilename);
    if (!safeFilename) {
      throw new AppError('Nama berkas tidak valid atau terdeteksi upaya traversal.', 400);
    }

    // 3. Resolve file strictly within property-specific directory: backend/uploads/surveys/{houseId}/
    // Cryptographically and structurally binds the asset to the exact House being authorized.
    const resolved = resolveHouseSurveyPhotoPath(houseId, safeFilename);
    if (!resolved) {
      throw new AppError('Nama berkas tidak valid atau terdeteksi upaya traversal.', 400);
    }

    const { absolutePath } = resolved;
    if (!fs.existsSync(absolutePath)) {
      throw new AppError('Foto survei tidak ditemukan pada properti ini.', 404);
    }

    // 4. Determine mime type
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeType =
      ext === '.png'
        ? 'image/png'
        : ext === '.svg'
          ? 'image/svg+xml'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/jpeg';

    // 5. Stream securely
    streamFileSecurely(req, res, {
      filePath: absolutePath,
      mimeType,
      fileName: safeFilename,
    });
  } catch (err) {
    next(err);
  }
}

export async function getHouseQuota(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId);
    const quota = await HouseService.getHouseQuota(houseId);
    res.json({ success: true, data: quota });
  } catch (err) {
    next(err);
  }
}

export async function placeHouseDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    const device = await HouseService.placeDeviceOnHouse(houseId, req.body, req.user);
    res.status(201).json({
      success: true,
      message: 'Perangkat berhasil ditempatkan pada denah rumah',
      data: device,
    });
  } catch (err) {
    next(err);
  }
}

export async function markHouseReadyForHandover(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.id as string;
    const result = await HouseService.markReadyForHandover(houseId, req.user);
    res.json({
      success: true,
      message: 'Properti berhasil ditandai siap serah terima (READY_FOR_HANDOVER)',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
