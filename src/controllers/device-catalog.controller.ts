import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { DeviceCatalogService } from '../services/device-catalog.service.js';

export async function listDeviceCatalog(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, search, activeOnly } = req.query;
    const items = await DeviceCatalogService.listCatalog({
      category: typeof category === 'string' ? category : undefined,
      search: typeof search === 'string' ? search : undefined,
      activeOnly: activeOnly === 'false' ? false : true,
    });

    res.json({
      success: true,
      total: items.length,
      data: items,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceCatalogById(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const item = await DeviceCatalogService.getCatalogById(id);

    res.json({
      success: true,
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceCatalogByType(
  req: Request<{ deviceType: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { deviceType } = req.params;
    const item = await DeviceCatalogService.getCatalogByType(deviceType);

    res.json({
      success: true,
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function getDeviceCapabilities(
  req: Request<{ deviceType: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { deviceType } = req.params;
    const capabilities = await DeviceCatalogService.getCapabilitiesByType(deviceType);

    res.json({
      success: true,
      deviceType,
      capabilities,
    });
  } catch (err) {
    next(err);
  }
}

export async function createDeviceCatalogItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await DeviceCatalogService.createCatalogItem(req.body);
    res.status(201).json({
      success: true,
      message: 'Katalog perangkat IoT berhasil ditambahkan.',
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateDeviceCatalogItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await DeviceCatalogService.updateCatalogItem(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Katalog perangkat IoT berhasil diperbarui.',
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteDeviceCatalogItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await DeviceCatalogService.deleteCatalogItem(req.params.id);
    res.json({
      success: true,
      message: 'Katalog perangkat IoT berhasil dihapus/dinonaktifkan.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadDevice3dModel(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada berkas model 3D .glb yang diunggah.',
      });
    }

    const updated = await DeviceCatalogService.save3dModel(
      req.params.id,
      req.file.buffer,
      req.file.originalname
    );

    res.json({
      success: true,
      message: 'Model 3D (.glb) perangkat berhasil disimpan.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function streamDevice3dModel(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const filePath = await DeviceCatalogService.get3dModelPath(req.params.id);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Berkas model 3D (.glb) perangkat belum tersedia.',
      });
    }

    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

