import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from './db.service.js';
import { FURNITURE_3D_DIR } from '../utils/storage-path.util.js';

export class ObjectCatalogService {
  static async listCatalogItems(options?: { category?: string; search?: string; activeOnly?: boolean }) {
    const { category, search, activeOnly = true } = options || {};

    return prisma.objectCatalogItem.findMany({
      where: {
        ...(activeOnly && { isActive: true }),
        ...(category && category !== 'ALL' && { category }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        _count: {
          select: { instances: true },
        },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  static async getCatalogItemById(id: string) {
    return prisma.objectCatalogItem.findUnique({
      where: { id },
      include: {
        _count: {
          select: { instances: true },
        },
      },
    });
  }

  static async getCategories() {
    const items = await prisma.objectCatalogItem.findMany({
      where: { isActive: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return items.map((i) => i.category);
  }

  /**
   * Create new furniture / interior addon catalog item
   */
  static async createCatalogItem(data: {
    name: string;
    category: string;
    description?: string;
    assetPath?: string;
    svgContent?: string;
    defaultWidth?: number;
    defaultHeight?: number;
    placementTarget?: string;
    defaultElevation?: number;
    dimensionLength?: number;
    dimensionWidth?: number;
    dimensionHeight?: number;
  }) {
    return prisma.objectCatalogItem.create({
      data: {
        name: data.name.trim(),
        category: (data.category || 'LIVING_ROOM').toUpperCase(),
        description: data.description?.trim(),
        assetPath: data.assetPath || '',
        svgContent: data.svgContent,
        defaultWidth: data.defaultWidth ?? 80,
        defaultHeight: data.defaultHeight ?? 80,
        placementTarget: data.placementTarget || 'FLOOR',
        defaultElevation: data.defaultElevation ?? 0.0,
        dimensionLength: data.dimensionLength ?? 1.0,
        dimensionWidth: data.dimensionWidth ?? 1.0,
        dimensionHeight: data.dimensionHeight ?? 0.8,
      },
    });
  }

  /**
   * Update existing furniture / interior addon catalog item
   */
  static async updateCatalogItem(
    id: string,
    data: Partial<{
      name: string;
      category: string;
      description: string;
      assetPath: string;
      svgContent: string;
      defaultWidth: number;
      defaultHeight: number;
      placementTarget: string;
      defaultElevation: number;
      dimensionLength: number;
      dimensionWidth: number;
      dimensionHeight: number;
      isActive: boolean;
    }>
  ) {
    const existing = await this.getCatalogItemById(id);
    if (!existing) {
      throw new Error(`Catalog item with id '${id}' not found.`);
    }

    return prisma.objectCatalogItem.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.category && { category: data.category.toUpperCase() }),
        ...(data.description !== undefined && { description: data.description?.trim() }),
        ...(data.assetPath !== undefined && { assetPath: data.assetPath }),
        ...(data.svgContent !== undefined && { svgContent: data.svgContent }),
        ...(data.defaultWidth !== undefined && { defaultWidth: data.defaultWidth }),
        ...(data.defaultHeight !== undefined && { defaultHeight: data.defaultHeight }),
        ...(data.placementTarget && { placementTarget: data.placementTarget }),
        ...(data.defaultElevation !== undefined && { defaultElevation: Number(data.defaultElevation) }),
        ...(data.dimensionLength !== undefined && { dimensionLength: Number(data.dimensionLength) }),
        ...(data.dimensionWidth !== undefined && { dimensionWidth: Number(data.dimensionWidth) }),
        ...(data.dimensionHeight !== undefined && { dimensionHeight: Number(data.dimensionHeight) }),
        ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
      },
    });
  }

  /**
   * Delete or deactivate catalog item
   */
  static async deleteCatalogItem(id: string) {
    const item = await this.getCatalogItemById(id);
    if (!item) {
      throw new Error(`Catalog item with id '${id}' not found.`);
    }

    const count = (item as any)._count?.instances || 0;
    if (count > 0) {
      // Soft deactivate if in use by floor plans
      return prisma.objectCatalogItem.update({
        where: { id },
        data: { isActive: false },
      });
    }

    // Clean up 3D file if exists
    if (item.modelGlbPath) {
      const fullPath = path.resolve(FURNITURE_3D_DIR, path.basename(item.modelGlbPath));
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    return prisma.objectCatalogItem.delete({
      where: { id },
    });
  }

  /**
   * Save uploaded 3D GLB model for furniture item
   */
  static async save3dModel(id: string, fileBuffer: Buffer, originalName: string) {
    const item = await this.getCatalogItemById(id);
    if (!item) {
      throw new Error(`Catalog item with id '${id}' not found.`);
    }

    // Create unique filename
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const safeBase = originalName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/\.glb$/i, '')
      .slice(0, 30);
    const fileName = `furn3d-${safeBase}-${uniqueSuffix}.glb`;
    const destPath = path.resolve(FURNITURE_3D_DIR, fileName);

    // Clean up old model if existed
    if (item.modelGlbPath) {
      const oldPath = path.resolve(FURNITURE_3D_DIR, path.basename(item.modelGlbPath));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    fs.writeFileSync(destPath, fileBuffer);

    const relativePath = `uploads/models-3d/furniture/${fileName}`;

    return prisma.objectCatalogItem.update({
      where: { id },
      data: {
        modelGlbPath: relativePath,
      },
    });
  }

  /**
   * Get absolute path of 3D GLB model file for streaming
   */
  static async get3dModelPath(id: string): Promise<string | null> {
    const item = await prisma.objectCatalogItem.findUnique({
      where: { id },
      select: { modelGlbPath: true },
    });

    if (!item?.modelGlbPath) return null;

    const fileName = path.basename(item.modelGlbPath);
    const fullPath = path.resolve(FURNITURE_3D_DIR, fileName);
    return fs.existsSync(fullPath) ? fullPath : null;
  }
}

