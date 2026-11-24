import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { ObjectCatalogService } from '../services/object-catalog.service.js';

export async function listCatalogItems(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, search } = req.query;
    const items = await ObjectCatalogService.listCatalogItems({
      category: category as string,
      search: search as string,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

export async function getCatalogCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await ObjectCatalogService.getCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
}

export async function getCatalogItemById(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await ObjectCatalogService.getCatalogItemById(req.params.id as string);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Catalog item not found' });
    }
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
}

export async function streamCatalogAsset(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await ObjectCatalogService.getCatalogItemById(req.params.id as string);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Catalog item not found' });
    }

    if (item.assetPath) {
      const absPath = path.resolve(item.assetPath);
      if (fs.existsSync(absPath)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        return fs.createReadStream(absPath).pipe(res);
      }
    }

    if (item.svgContent) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(item.svgContent);
    }

    res.status(404).json({ success: false, message: 'Visual asset content not available' });
  } catch (err) {
    next(err);
  }
}
