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

export async function createObjectCatalogItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await ObjectCatalogService.createCatalogItem(req.body);
    res.status(201).json({
      success: true,
      message: 'Katalog furnitur / addon interior berhasil ditambahkan.',
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateObjectCatalogItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const item = await ObjectCatalogService.updateCatalogItem(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Katalog furnitur / addon interior berhasil diperbarui.',
      data: item,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteObjectCatalogItem(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const result = await ObjectCatalogService.deleteCatalogItem(req.params.id);
    res.json({
      success: true,
      message: 'Katalog furnitur / addon interior berhasil dihapus/dinonaktifkan.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function uploadObject3dModel(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada berkas model 3D .glb yang diunggah.',
      });
    }

    const updated = await ObjectCatalogService.save3dModel(
      req.params.id,
      req.file.buffer,
      req.file.originalname
    );

    res.json({
      success: true,
      message: 'Model 3D (.glb) furnitur berhasil disimpan.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function streamObject3dModel(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  try {
    const filePath = await ObjectCatalogService.get3dModelPath(req.params.id);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Berkas model 3D (.glb) furnitur belum tersedia.',
      });
    }

    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}
