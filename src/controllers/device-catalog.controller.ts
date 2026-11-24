import { Request, Response, NextFunction } from 'express';
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

