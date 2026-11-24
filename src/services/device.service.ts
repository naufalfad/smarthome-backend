import { prisma } from './db.service.js';
import { isPointInPolygon, Point } from '../utils/geometry.js';
import {
  DeviceCapability,
  validateDeviceConfiguration,
  getCatalogDefinitionByType,
  DEVICE_TYPE_ALIASES,
} from '../constants/device-capabilities.js';
import { DeviceCatalogService } from './device-catalog.service.js';

export interface CreateDeviceDto {
  name?: string;
  type?: string;
  catalogItemId?: string;
  x?: number;
  y?: number;
  normalizedX?: number;
  normalizedY?: number;
  rotation?: number;
  iconWidth?: number;
  iconHeight?: number;
  manualRoomName?: string;
  roomId?: string | null;
  configuration?: any;
  integrationStatus?: string;
  status?: string;
}

export interface UpdateDeviceDto {
  name?: string;
  type?: string;
  catalogItemId?: string | null;
  x?: number;
  y?: number;
  normalizedX?: number;
  normalizedY?: number;
  rotation?: number;
  iconWidth?: number;
  iconHeight?: number;
  manualRoomName?: string | null;
  roomId?: string | null;
  configuration?: any;
  integrationStatus?: string;
  status?: string;
}

export class DeviceService {
  /**
   * List all devices on a specific floor plan
   */
  static async listDevicesByFloorPlan(floorPlanId: string) {
    return prisma.device.findMany({
      where: { floorPlanId },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * List all devices for an entire house
   */
  static async listDevicesByHouse(houseId: string) {
    return prisma.device.findMany({
      where: { houseId },
      include: {
        room: true,
        floor: true,
        floorPlan: true,
        catalogItem: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get single device by ID
   */
  static async getDeviceById(id: string) {
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        room: true,
        floor: true,
        floorPlan: true,
        house: true,
        catalogItem: true,
      },
    });

    if (!device) {
      throw new Error(`Device with id '${id}' not found.`);
    }

    return device;
  }

  /**
   * Place a new IoT device on the 2D floor plan
   */
  static async createDevice(floorPlanId: string, data: CreateDeviceDto) {
    // 1. Validate FloorPlan ownership and existence
    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
      include: {
        floor: {
          include: {
            house: true,
            rooms: { where: { isActive: true } },
          },
        },
      },
    });

    if (!plan) {
      throw new Error(`Floor plan with id '${floorPlanId}' not found.`);
    }

    if (!plan.floor || !plan.floor.house) {
      throw new Error(`Floor plan with id '${floorPlanId}' is not associated with a valid Floor or House.`);
    }

    // 2. Resolve Catalog Item & Capabilities
    let catalogItem: any = null;
    let resolvedType = data.type || 'LIGHT';
    let resolvedCapabilities: DeviceCapability[] = [];
    let initialConfig: Record<string, any> = {};

    if (data.catalogItemId) {
      catalogItem = await prisma.deviceCatalogItem.findUnique({
        where: { id: data.catalogItemId },
      });

      if (!catalogItem) {
        throw new Error(`Katalog perangkat dengan id '${data.catalogItemId}' tidak ditemukan.`);
      }

      if (!catalogItem.isActive) {
        throw new Error(`Katalog perangkat '${catalogItem.name}' sedang non-aktif.`);
      }

      resolvedType = catalogItem.deviceType;
      resolvedCapabilities = (catalogItem.capabilities as unknown as DeviceCapability[]) || [];
      initialConfig = { ...(catalogItem.defaultConfiguration as Record<string, any>) };
    } else {
      // Lookup by type or fallback definition
      try {
        catalogItem = await DeviceCatalogService.getCatalogByType(resolvedType);
        if (catalogItem && !catalogItem.id.startsWith('virtual-')) {
          resolvedType = catalogItem.deviceType;
          resolvedCapabilities = (catalogItem.capabilities as unknown as DeviceCapability[]) || [];
          initialConfig = { ...(catalogItem.defaultConfiguration as Record<string, any>) };
        } else {
          const fallback = getCatalogDefinitionByType(resolvedType);
          if (fallback) {
            resolvedType = fallback.deviceType;
            resolvedCapabilities = fallback.capabilities;
            initialConfig = { ...fallback.defaultConfiguration };
          }
        }
      } catch (err) {
        // Fallback gracefully if catalog lookup throws
      }
    }

    // 3. Validate and merge configuration
    if (data.configuration && typeof data.configuration === 'object') {
      if (resolvedCapabilities.length > 0) {
        const valRes = validateDeviceConfiguration(resolvedCapabilities, data.configuration, false);
        if (!valRes.isValid) {
          throw new Error(`Konfigurasi perangkat tidak valid: ${valRes.errors.join('; ')}`);
        }
        initialConfig = { ...initialConfig, ...valRes.validatedConfig };
      } else {
        initialConfig = { ...initialConfig, ...data.configuration };
      }
    }

    // 4. Coordinates calculation
    const baseW = plan.imageWidth || plan.viewBoxWidth || 1600;
    const baseH = plan.imageHeight || plan.viewBoxHeight || 1000;

    let posX = data.x ?? 0;
    let posY = data.y ?? 0;
    let normX = data.normalizedX;
    let normY = data.normalizedY;

    if (normX !== undefined && normY !== undefined && (data.x === undefined || data.y === undefined)) {
      posX = Math.round(normX * baseW);
      posY = Math.round(normY * baseH);
    } else {
      normX = baseW > 0 ? Math.max(0, Math.min(1, Math.round((posX / baseW) * 10000) / 10000)) : 0;
      normY = baseH > 0 ? Math.max(0, Math.min(1, Math.round((posY / baseH) * 10000) / 10000)) : 0;
    }

    // 5. Room assignment & floor consistency check
    let assignedRoomId = data.roomId || null;
    let autoRoomName = data.manualRoomName || null;

    if (assignedRoomId) {
      const roomCheck = await prisma.room.findUnique({ where: { id: assignedRoomId } });
      if (!roomCheck || roomCheck.floorId !== plan.floorId) {
        throw new Error(`Ruangan dengan id '${assignedRoomId}' tidak berada di lantai yang sama.`);
      }
      if (!autoRoomName) {
        autoRoomName = roomCheck.name;
      }
    } else if (plan.floor.rooms && plan.floor.rooms.length > 0) {
      // Spatial detection
      const point: Point = { x: posX, y: posY };
      for (const room of plan.floor.rooms) {
        if (room.polygonCoordinates && Array.isArray(room.polygonCoordinates)) {
          const poly = room.polygonCoordinates as unknown as Point[];
          if (poly.length >= 3 && isPointInPolygon(point, poly)) {
            assignedRoomId = room.id;
            if (!autoRoomName) {
              autoRoomName = room.name;
            }
            break;
          }
        }
      }
    }

    const deviceName = data.name || (catalogItem ? catalogItem.name : `${resolvedType} Device`);
    const defaultIconW = catalogItem?.defaultWidth ?? 48;
    const defaultIconH = catalogItem?.defaultHeight ?? 48;

    const device = await prisma.device.create({
      data: {
        name: deviceName,
        type: resolvedType,
        catalogItemId: catalogItem && !catalogItem.id.startsWith('virtual-') ? catalogItem.id : null,
        status: data.status || 'OFFLINE',
        integrationStatus: data.integrationStatus || 'ONLINE',
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
        x: posX,
        y: posY,
        normalizedX: normX,
        normalizedY: normY,
        rotation: data.rotation || 0,
        iconWidth: data.iconWidth ?? defaultIconW,
        iconHeight: data.iconHeight ?? defaultIconH,
        manualRoomName: autoRoomName,
        configuration: initialConfig,
        floorPlanId,
        floorId: plan.floorId,
        houseId: plan.floor.houseId,
        roomId: assignedRoomId,
      },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
    });

    return device;
  }

  /**
   * Update device position, properties, configuration, or integration status
   */
  static async updateDevice(id: string, data: UpdateDeviceDto) {
    const existing = await prisma.device.findUnique({
      where: { id },
      include: {
        catalogItem: true,
        floorPlan: true,
        floor: {
          include: {
            rooms: { where: { isActive: true } },
          },
        },
      },
    });

    if (!existing) {
      throw new Error(`Device with id '${id}' not found.`);
    }

    // Coordinate re-synchronization
    let posX = data.x !== undefined ? data.x : existing.x;
    let posY = data.y !== undefined ? data.y : existing.y;
    let normX = data.normalizedX !== undefined ? data.normalizedX : existing.normalizedX;
    let normY = data.normalizedY !== undefined ? data.normalizedY : existing.normalizedY;

    const plan = existing.floorPlan;
    const baseW = plan?.imageWidth || plan?.viewBoxWidth || 1600;
    const baseH = plan?.imageHeight || plan?.viewBoxHeight || 1000;

    if (data.x !== undefined || data.y !== undefined) {
      normX = baseW > 0 ? Math.max(0, Math.min(1, Math.round((posX / baseW) * 10000) / 10000)) : 0;
      normY = baseH > 0 ? Math.max(0, Math.min(1, Math.round((posY / baseH) * 10000) / 10000)) : 0;
    } else if (data.normalizedX !== undefined || data.normalizedY !== undefined) {
      posX = Math.round(normX * baseW);
      posY = Math.round(normY * baseH);
    }

    // Room assignment
    let assignedRoomId = data.roomId !== undefined ? data.roomId : existing.roomId;
    let roomName = data.manualRoomName !== undefined ? data.manualRoomName : existing.manualRoomName;

    if (data.roomId !== undefined && data.roomId !== null) {
      const roomCheck = await prisma.room.findUnique({ where: { id: data.roomId } });
      if (!roomCheck || roomCheck.floorId !== existing.floorId) {
        throw new Error(`Ruangan dengan id '${data.roomId}' tidak berada di lantai yang sama.`);
      }
      if (data.manualRoomName === undefined) {
        roomName = roomCheck.name;
      }
    }

    // Configuration validation if updated
    let updatedConfig = existing.configuration as Record<string, any> || {};
    if (data.configuration && typeof data.configuration === 'object') {
      const capabilities: DeviceCapability[] =
        (existing.catalogItem?.capabilities as unknown as DeviceCapability[]) ||
        (await DeviceCatalogService.getCapabilitiesByType(existing.type));

      if (capabilities && capabilities.length > 0) {
        const valRes = validateDeviceConfiguration(capabilities, data.configuration, false);
        if (!valRes.isValid) {
          throw new Error(`Konfigurasi tidak valid: ${valRes.errors.join('; ')}`);
        }
        updatedConfig = { ...updatedConfig, ...valRes.validatedConfig };
      } else {
        updatedConfig = { ...updatedConfig, ...data.configuration };
      }
    }

    const updated = await prisma.device.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.catalogItemId !== undefined && { catalogItemId: data.catalogItemId }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.integrationStatus !== undefined && { integrationStatus: data.integrationStatus }),
        x: posX,
        y: posY,
        normalizedX: normX,
        normalizedY: normY,
        ...(data.rotation !== undefined && { rotation: data.rotation }),
        ...(data.iconWidth !== undefined && { iconWidth: data.iconWidth }),
        ...(data.iconHeight !== undefined && { iconHeight: data.iconHeight }),
        manualRoomName: roomName,
        roomId: assignedRoomId,
        configuration: updatedConfig,
      },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
    });

    return updated;
  }

  /**
   * Update device configuration specifically with capability validation
   */
  static async updateDeviceConfiguration(
    id: string,
    configurationUpdates: Record<string, any>,
    isControlAction = false
  ) {
    const existing = await prisma.device.findUnique({
      where: { id },
      include: {
        catalogItem: true,
      },
    });

    if (!existing) {
      throw new Error(`Device with id '${id}' not found.`);
    }

    // Resolve capabilities
    let capabilities: DeviceCapability[] = [];
    if (existing.catalogItem?.capabilities) {
      capabilities = existing.catalogItem.capabilities as unknown as DeviceCapability[];
    } else {
      capabilities = await DeviceCatalogService.getCapabilitiesByType(existing.type);
    }

    // Validate
    const valRes = validateDeviceConfiguration(capabilities, configurationUpdates, isControlAction);
    if (!valRes.isValid) {
      throw new Error(`Validasi konfigurasi gagal: ${valRes.errors.join('; ')}`);
    }

    const currentConfig = (existing.configuration as Record<string, any>) || {};
    const mergedConfig = { ...currentConfig, ...valRes.validatedConfig };

    // Derived high-level status synchronization
    let nextStatus = existing.status;
    if (valRes.validatedConfig.power !== undefined) {
      nextStatus = valRes.validatedConfig.power ? 'ON' : 'OFF';
    } else if (valRes.validatedConfig.lockState !== undefined) {
      nextStatus = valRes.validatedConfig.lockState;
    }

    return prisma.device.update({
      where: { id },
      data: {
        configuration: mergedConfig,
        status: nextStatus,
        integrationStatus: 'SIMULATED',
      },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
    });
  }

  /**
   * Delete device from floor plan
   */
  static async deleteDevice(id: string) {
    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Device with id '${id}' not found.`);
    }

    return prisma.device.delete({
      where: { id },
    });
  }

  /**
   * Update device runtime telemetry / simulation state
   */
  static async updateTelemetry(id: string, status: string, configurationUpdates?: any) {
    const existing = await prisma.device.findUnique({
      where: { id },
      include: {
        catalogItem: true,
      },
    });

    if (!existing) {
      throw new Error(`Device with id '${id}' not found.`);
    }

    let mergedConfig = (existing.configuration as Record<string, any>) || {};

    if (configurationUpdates && typeof configurationUpdates === 'object') {
      const capabilities: DeviceCapability[] =
        (existing.catalogItem?.capabilities as unknown as DeviceCapability[]) ||
        (await DeviceCatalogService.getCapabilitiesByType(existing.type));

      if (capabilities && capabilities.length > 0) {
        const valRes = validateDeviceConfiguration(capabilities, configurationUpdates, false);
        if (!valRes.isValid) {
          throw new Error(`Data telemetri tidak valid: ${valRes.errors.join('; ')}`);
        }
        mergedConfig = { ...mergedConfig, ...valRes.validatedConfig };
      } else {
        mergedConfig = { ...mergedConfig, ...configurationUpdates };
      }
    }

    return prisma.device.update({
      where: { id },
      data: {
        status,
        configuration: mergedConfig,
        integrationStatus: 'SIMULATED',
      },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
    });
  }
}
