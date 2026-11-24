import { PropertyType, PropertySetupStatus, AssignmentStatus, ServiceOrderStatus } from '@prisma/client';
import { prisma } from './db.service.js';
import fs from 'fs';
import { resolveUploadPath } from '../utils/storage-path.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { PropertyAccessPolicy } from './property-access-policy.service.js';
import { DeviceService } from './device.service.js';
import { TokenPayload } from '../utils/auth-crypto.util.js';

export interface CreateHouseDeviceDto {
  name?: string;
  type?: string;
  catalogItemId?: string;
  floorId?: string;
  roomId?: string | null;
  x?: number;
  y?: number;
  normalizedX?: number;
  normalizedY?: number;
  rotation?: number;
  iconWidth?: number;
  iconHeight?: number;
  configuration?: any;
  status?: string;
  integrationStatus?: string;
}

export interface CreateHouseDto {
  name: string;
  description?: string;
  address?: string | null;
  propertyType?: PropertyType;
  hasPhysicalIot?: boolean;
  setupStatus?: PropertySetupStatus;
  customerId?: string | null;
}

const HOUSE_DEFAULT_INCLUDE = {
  customer: {
    select: {
      id: true,
      userId: true,
      fullName: true,
      phone: true,
      companyName: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  },
  floors: {
    orderBy: { levelNumber: 'asc' as const },
    include: {
      floorPlan: true,
    },
  },
};

export class HouseService {
  /**
   * Pure read-only listing of properties/houses.
   * PHASE 3: No longer auto-creates a demo 'Modern Smart Villa' property.
   * Returns a legitimate empty array [] when no properties exist.
   */
  static async listHouses(filters?: { customerId?: string }) {
    const where: any = {};
    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }

    return prisma.house.findMany({
      where,
      include: HOUSE_DEFAULT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Lists all properties owned by a specific CustomerProfile (1:N ownership).
   */
  static async listHousesByCustomerProfile(customerProfileId: string) {
    return this.listHouses({ customerId: customerProfileId });
  }

  /**
   * Lists all properties that an authenticated Technician is actively assigned to.
   */
  static async listHousesForTechnician(technicianProfileId: string) {
    if (!technicianProfileId) return [];

    const activeAssignments = await prisma.serviceOrderAssignment.findMany({
      where: {
        technicianProfileId,
        status: AssignmentStatus.ACTIVE,
        serviceOrder: {
          houseId: { not: null },
          status: ServiceOrderStatus.CONFIRMED,
        },
      },
      select: {
        serviceOrder: {
          select: { houseId: true },
        },
      },
    });

    const houseIds = activeAssignments
      .map((a) => a.serviceOrder.houseId)
      .filter((id): id is string => Boolean(id));

    if (houseIds.length === 0) return [];

    return prisma.house.findMany({
      where: { id: { in: houseIds } },
      include: HOUSE_DEFAULT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  static async getHouseById(id: string) {
    return prisma.house.findUnique({
      where: { id },
      include: HOUSE_DEFAULT_INCLUDE,
    });
  }

  static async createHouse(data: CreateHouseDto) {
    if (data.customerId) {
      const profile = await prisma.customerProfile.findUnique({
        where: { id: data.customerId },
        select: { id: true },
      });
      if (!profile) {
        throw new Error(`CustomerProfile with id '${data.customerId}' not found.`);
      }
    }

    return prisma.house.create({
      data: {
        name: data.name,
        description: data.description,
        address: data.address ?? null,
        propertyType: data.propertyType ?? 'HOUSE',
        hasPhysicalIot: data.hasPhysicalIot ?? true,
        setupStatus: data.setupStatus ?? 'DRAFT',
        customerId: data.customerId ?? null,
        floors: {
          create: {
            name: 'Lantai 1 (Ground Floor)',
            levelNumber: 1,
            floorPlan: {
              create: {
                name: 'Ground Floor Interactive Plan',
                viewBoxWidth: 1600,
                viewBoxHeight: 1000,
              },
            },
          },
        },
      },
      include: HOUSE_DEFAULT_INCLUDE,
    });
  }

  static async addFloor(houseId: string, data: { name: string; levelNumber?: number }) {
    let level = data.levelNumber;
    if (level === undefined) {
      const highestFloor = await prisma.floor.findFirst({
        where: { houseId },
        orderBy: { levelNumber: 'desc' },
      });
      level = highestFloor ? highestFloor.levelNumber + 1 : 1;
    }

    const floorName = data.name || `Lantai ${level}`;

    return prisma.floor.create({
      data: {
        houseId,
        name: floorName,
        levelNumber: level,
        floorPlan: {
          create: {
            name: `${floorName} Plan`,
            viewBoxWidth: 1600,
            viewBoxHeight: 1000,
          },
        },
      },
      include: {
        floorPlan: true,
      },
    });
  }

  static async deleteFloor(houseId: string, floorId: string) {
    const floor = await prisma.floor.findFirst({
      where: { id: floorId, houseId },
      include: { floorPlan: true },
    });

    if (!floor) {
      throw new Error(`Floor with id '${floorId}' not found in house '${houseId}'.`);
    }

    const totalFloors = await prisma.floor.count({ where: { houseId } });
    if (totalFloors <= 1) {
      throw new Error('Tidak dapat menghapus lantai terakhir. Minimal harus ada 1 lantai di dalam rumah.');
    }

    const imagePath = floor.floorPlan?.imagePath;

    await prisma.floor.delete({
      where: { id: floorId },
    });

    if (imagePath) {
      const resolvedPath = resolveUploadPath(imagePath);
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        try {
          fs.unlinkSync(resolvedPath);
        } catch (err) {
          console.warn('Non-critical: Failed to remove background image file upon floor deletion:', err);
        }
      }
    }

    return this.getHouseById(houseId);
  }

  /**
   * Retrieves device quota calculation for a house based on linked confirmed ServiceOrder.
   */
  static async getHouseQuota(houseId: string) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      select: { id: true, name: true, setupStatus: true },
    });
    if (!house) throw new AppError('Properti tidak ditemukan.', 404);

    const order = await prisma.serviceOrder.findFirst({
      where: {
        houseId,
        status: ServiceOrderStatus.CONFIRMED,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        packageSnapshot: true,
        servicePackage: {
          select: { maxDevices: true, maxRooms: true },
        },
      },
    });

    const currentDevices = await prisma.device.count({ where: { houseId } });
    const maxDevices =
      (order?.packageSnapshot as any)?.maxDevices ??
      order?.servicePackage?.maxDevices ??
      null;

    return {
      houseId: house.id,
      currentDevices,
      maxDevices,
      isQuotaReached: maxDevices !== null ? currentDevices >= maxDevices : false,
      serviceOrder: order
        ? {
            id: order.id,
            orderNumber: order.orderNumber,
            maxDevices,
          }
        : null,
    };
  }

  /**
   * Places an IoT device on a house, enforcing technician authorization and package quota.
   */
  static async placeDeviceOnHouse(
    houseId: string,
    data: CreateHouseDeviceDto,
    user: TokenPayload | undefined
  ) {
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    if (user.role === 'TECHNICIAN') {
      const isAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
        user.technicianProfileId,
        houseId
      );
      if (!isAssigned) {
        throw new AppError(
          'Akses dilarang: Teknisi belum memiliki penugasan aktif pada properti ini.',
          403
        );
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      throw new AppError(
        'Akses dilarang: Hanya Super Admin atau Teknisi bertugas yang dapat menempatkan perangkat.',
        403
      );
    }

    // Enforce quota
    const quota = await this.getHouseQuota(houseId);
    if (quota.maxDevices !== null && quota.currentDevices >= quota.maxDevices) {
      throw new AppError(
        `Batas kuota perangkat untuk paket layanan ini telah tercapai (maksimal ${quota.maxDevices} perangkat).`,
        400
      );
    }

    // Resolve target floor
    let targetFloorId = data.floorId;
    if (!targetFloorId) {
      const firstFloor = await prisma.floor.findFirst({
        where: { houseId },
        orderBy: { levelNumber: 'asc' },
      });
      if (!firstFloor) {
        throw new AppError('Properti belum memiliki lantai untuk penempatan perangkat.', 400);
      }
      targetFloorId = firstFloor.id;
    }

    // Resolve floor plan
    let floorPlan = await prisma.floorPlan.findUnique({
      where: { floorId: targetFloorId },
    });
    if (!floorPlan) {
      floorPlan = await prisma.floorPlan.create({
        data: {
          floorId: targetFloorId,
          name: 'Interactive Floor Plan',
          viewBoxWidth: 1600,
          viewBoxHeight: 1000,
        },
      });
    }

    // Set default initial state and config based on device type
    const devType = (data.type || 'LIGHT').toUpperCase();
    const initialStatus = data.status || 'OFF';

    const created = await DeviceService.createDevice(floorPlan.id, {
      ...data,
      type: devType,
      status: initialStatus,
      integrationStatus: data.integrationStatus || 'ONLINE',
      configuration: data.configuration,
    });

    // Ensure providerType = 'VIRTUAL' and connectionStatus = 'ONLINE'
    const updated = await prisma.device.update({
      where: { id: created.id },
      data: {
        providerType: 'VIRTUAL',
        connectionStatus: 'ONLINE',
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
   * Marks a property as READY_FOR_HANDOVER after technician completes setup & commissioning.
   */
  static async markReadyForHandover(houseId: string, user: TokenPayload | undefined) {
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    if (user.role === 'TECHNICIAN') {
      const isAssigned = await PropertyAccessPolicy.isTechnicianAssigned(
        user.technicianProfileId,
        houseId
      );
      if (!isAssigned) {
        throw new AppError(
          'Akses dilarang: Teknisi belum memiliki penugasan aktif pada properti ini.',
          403
        );
      }
    } else if (user.role !== 'SUPER_ADMIN') {
      throw new AppError('Akses dilarang.', 403);
    }

    const house = await prisma.house.findUnique({
      where: { id: houseId },
      select: { id: true, name: true, setupStatus: true },
    });

    if (!house) {
      throw new AppError('Properti tidak ditemukan.', 404);
    }

    if (house.setupStatus === PropertySetupStatus.ACTIVE) {
      throw new AppError('Properti sudah berstatus aktif (ACTIVE).', 409);
    }

    const deviceCount = await prisma.device.count({ where: { houseId } });
    if (deviceCount === 0) {
      throw new AppError(
        'Pengajuan serah terima ditolak: Minimal 1 perangkat IoT harus terpasang pada properti.',
        400
      );
    }

    const updated = await prisma.house.update({
      where: { id: houseId },
      data: {
        setupStatus: PropertySetupStatus.READY_FOR_HANDOVER,
      },
      include: HOUSE_DEFAULT_INCLUDE,
    });

    return {
      house: updated,
      deviceCount,
    };
  }
}
