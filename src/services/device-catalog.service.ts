import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from './db.service.js';
import { DEVICES_3D_DIR } from '../utils/storage-path.util.js';
import {
  DeviceCapability,
  DeviceCatalogDefinition,
  getCatalogDefinitionByType,
  DEVICE_TYPE_ALIASES,
} from '../constants/device-capabilities.js';

export interface ListCatalogQueryOptions {
  category?: string;
  search?: string;
  activeOnly?: boolean;
}

export class DeviceCatalogService {
  /**
   * List all IoT device catalog items with optional filtering
   */
  static async listCatalog(options?: ListCatalogQueryOptions) {
    const { category, search, activeOnly = true } = options || {};

    const where: any = {};
    if (activeOnly) {
      where.isActive = true;
    }
    if (category && category !== 'ALL') {
      where.category = category.toUpperCase();
    }
    if (search && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { deviceType: { contains: q, mode: 'insensitive' } },
      ];
    }

    return prisma.deviceCatalogItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Get single catalog item by ID
   */
  static async getCatalogById(id: string) {
    const item = await prisma.deviceCatalogItem.findUnique({
      where: { id },
      include: {
        _count: {
          select: { devices: true },
        },
      },
    });

    if (!item) {
      throw new Error(`Device catalog item with id '${id}' not found.`);
    }

    return item;
  }

  /**
   * Get catalog item or fallback definition by deviceType
   */
  static async getCatalogByType(deviceType: string) {
    const normalized = (deviceType || '').toUpperCase().trim();
    const canonical = DEVICE_TYPE_ALIASES[normalized] || normalized;

    // 1. Try fetching from database
    const item = await prisma.deviceCatalogItem.findFirst({
      where: {
        OR: [{ deviceType: canonical }, { deviceType: normalized }],
        isActive: true,
      },
    });

    if (item) return item;

    // 2. Fallback to hardcoded definition if not yet seeded
    const fallback = getCatalogDefinitionByType(canonical);
    if (!fallback) {
      throw new Error(`Device type '${deviceType}' is not supported in the IoT catalog.`);
    }

    return {
      id: `virtual-${fallback.deviceType.toLowerCase()}`,
      ...fallback,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Get capabilities definition for a given deviceType
   */
  static async getCapabilitiesByType(deviceType: string): Promise<DeviceCapability[]> {
    const catalogItem = await this.getCatalogByType(deviceType);
    return (catalogItem.capabilities as unknown as DeviceCapability[]) || [];
  }

  /**
   * Create a new IoT device catalog item
   */
  static async createCatalogItem(data: {
    name: string;
    deviceType: string;
    category: string;
    description?: string;
    icon?: string;
    color?: string;
    defaultWidth?: number;
    defaultHeight?: number;
    capabilities?: any[];
    defaultConfiguration?: Record<string, any>;
    placementTarget?: string;
    defaultElevation?: number;
    dimensionLength?: number;
    dimensionWidth?: number;
    dimensionHeight?: number;
  }) {
    const canonicalType = (data.deviceType || '').toUpperCase().trim();
    return prisma.deviceCatalogItem.create({
      data: {
        name: data.name.trim(),
        deviceType: canonicalType,
        category: (data.category || 'LIGHTING').toUpperCase(),
        description: data.description?.trim(),
        icon: data.icon || 'lightbulb',
        color: data.color || '#8B5CF6',
        defaultWidth: data.defaultWidth ?? 48,
        defaultHeight: data.defaultHeight ?? 48,
        capabilities: (data.capabilities as any) || [],
        defaultConfiguration: data.defaultConfiguration || {},
        placementTarget: data.placementTarget || 'WALL',
        defaultElevation: data.defaultElevation ?? 1.2,
        dimensionLength: data.dimensionLength ?? 0.12,
        dimensionWidth: data.dimensionWidth ?? 0.12,
        dimensionHeight: data.dimensionHeight ?? 0.04,
      },
    });
  }

  /**
   * Update an existing device catalog item
   */
  static async updateCatalogItem(
    id: string,
    data: Partial<{
      name: string;
      category: string;
      description: string;
      icon: string;
      color: string;
      defaultWidth: number;
      defaultHeight: number;
      capabilities: any[];
      defaultConfiguration: Record<string, any>;
      placementTarget: string;
      defaultElevation: number;
      dimensionLength: number;
      dimensionWidth: number;
      dimensionHeight: number;
      isActive: boolean;
    }>
  ) {
    await this.getCatalogById(id);

    return prisma.deviceCatalogItem.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.category && { category: data.category.toUpperCase() }),
        ...(data.description !== undefined && { description: data.description?.trim() }),
        ...(data.icon && { icon: data.icon }),
        ...(data.color && { color: data.color }),
        ...(data.defaultWidth !== undefined && { defaultWidth: data.defaultWidth }),
        ...(data.defaultHeight !== undefined && { defaultHeight: data.defaultHeight }),
        ...(data.capabilities && { capabilities: data.capabilities as any }),
        ...(data.defaultConfiguration && { defaultConfiguration: data.defaultConfiguration }),
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
    const item = await this.getCatalogById(id);
    const count = (item as any)._count?.devices || 0;
    if (count > 0) {
      // Soft-deactivate if in use by devices
      return prisma.deviceCatalogItem.update({
        where: { id },
        data: { isActive: false },
      });
    }

    // If GLB exists, delete file
    if (item.modelGlbPath) {
      const fullPath = path.resolve(DEVICES_3D_DIR, path.basename(item.modelGlbPath));
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    return prisma.deviceCatalogItem.delete({
      where: { id },
    });
  }

  /**
   * Save uploaded 3D GLB model for a device catalog item
   */
  static async save3dModel(id: string, fileBuffer: Buffer, originalName: string) {
    const item = await this.getCatalogById(id);

    // Create unique filename
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const safeBase = originalName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/\.glb$/i, '')
      .slice(0, 30);
    const fileName = `dev3d-${safeBase}-${uniqueSuffix}.glb`;
    const destPath = path.resolve(DEVICES_3D_DIR, fileName);

    // Clean up old model if existed
    if (item.modelGlbPath) {
      const oldPath = path.resolve(DEVICES_3D_DIR, path.basename(item.modelGlbPath));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Write file
    fs.writeFileSync(destPath, fileBuffer);

    // Relative storage path stored in DB
    const relativePath = `uploads/models-3d/devices/${fileName}`;

    return prisma.deviceCatalogItem.update({
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
    const item = await prisma.deviceCatalogItem.findUnique({
      where: { id },
      select: { modelGlbPath: true },
    });

    if (!item?.modelGlbPath) return null;

    const fileName = path.basename(item.modelGlbPath);
    const fullPath = path.resolve(DEVICES_3D_DIR, fileName);
    return fs.existsSync(fullPath) ? fullPath : null;
  }
}

