import { prisma } from './db.service.js';
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
}

