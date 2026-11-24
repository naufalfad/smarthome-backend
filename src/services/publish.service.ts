import { prisma } from './db.service.js';

export interface PublishValidationResult {
  canPublish: boolean;
  publishStatus: string;
  publishedAt: Date | null;
  totalFloors: number;
  totalDevices: number;
  unconfiguredDevices: number;
  checks: {
    hasHouse: boolean;
    hasFloorPlanImage: boolean;
    hasDevices: boolean;
    allDevicesHaveValidType: boolean;
  };
  validationErrors: string[];
  warnings: string[];
}

export class PublishService {
  /**
   * Audit publish readiness of a house and its floor plans
   */
  static async getPublishStatus(houseId: string): Promise<PublishValidationResult> {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: {
        floors: {
          include: {
            floorPlan: true,
          },
        },
        devices: true,
      },
    });

    if (!house) {
      throw new Error(`House with id '${houseId}' not found.`);
    }

    const validationErrors: string[] = [];
    const warnings: string[] = [];

    // 1. Check Floor Plan Image
    const floorPlansWithImage = house.floors.filter(
      (f) => f.floorPlan && f.floorPlan.imagePath
    );
    const hasFloorPlanImage = floorPlansWithImage.length > 0;
    if (!hasFloorPlanImage) {
      validationErrors.push('Setidaknya satu lantai harus memiliki gambar denah yang sudah di-upload.');
    }

    // 2. Check Devices Count
    const totalDevices = house.devices.length;
    const hasDevices = totalDevices > 0;
    if (!hasDevices) {
      validationErrors.push('Dashboard memerlukan minimal 1 perangkat IoT yang ditempatkan pada denah sebelum dipublikasikan.');
    }

    // 3. Check Device Identity & Types
    let allDevicesHaveValidType = true;
    let unconfiguredDevices = 0;

    for (const dev of house.devices) {
      if (!dev.name || !dev.name.trim() || !dev.type) {
        allDevicesHaveValidType = false;
        validationErrors.push(`Perangkat '${dev.id}' tidak memiliki nama atau tipe yang valid.`);
      }
      if (dev.integrationStatus === 'UNCONFIGURED') {
        unconfiguredDevices++;
      }
    }

    if (unconfiguredDevices > 0) {
      warnings.push(`${unconfiguredDevices} perangkat belum terintegrasi fisik (akan ditampilkan sebagai belum terhubung kepada client).`);
    }

    const canPublish = validationErrors.length === 0;

    return {
      canPublish,
      publishStatus: house.publishStatus || 'DRAFT',
      publishedAt: house.publishedAt,
      totalFloors: house.floors.length,
      totalDevices,
      unconfiguredDevices,
      checks: {
        hasHouse: true,
        hasFloorPlanImage,
        hasDevices,
        allDevicesHaveValidType,
      },
      validationErrors,
      warnings,
    };
  }

  /**
   * Publish a house dashboard to client
   */
  static async publishHouse(houseId: string) {
    const audit = await this.getPublishStatus(houseId);
    if (!audit.canPublish) {
      throw new Error(`Gagal mempublikasikan dashboard: ${audit.validationErrors.join(', ')}`);
    }

    const now = new Date();

    const [updatedHouse] = await prisma.$transaction([
      prisma.house.update({
        where: { id: houseId },
        data: {
          publishStatus: 'PUBLISHED',
          publishedAt: now,
        },
      }),
      // Set all associated floor plans to PUBLISHED
      prisma.floorPlan.updateMany({
        where: {
          floor: { houseId },
        },
        data: {
          publishStatus: 'PUBLISHED',
          publishedAt: now,
        },
      }),
    ]);

    return {
      success: true,
      house: updatedHouse,
      publishStatus: 'PUBLISHED',
      publishedAt: now,
      message: 'Dashboard Smart Home berhasil dipublikasikan untuk client.',
    };
  }

  /**
   * Set house dashboard status to PREVIEW mode
   */
  static async previewHouse(houseId: string) {
    const house = await prisma.house.update({
      where: { id: houseId },
      data: {
        publishStatus: 'PREVIEW',
      },
    });

    return {
      success: true,
      house,
      publishStatus: 'PREVIEW',
      message: 'Mode Preview Monitoring aktif. Dashboard siap diuji oleh admin.',
    };
  }

  /**
   * Unpublish house dashboard back to DRAFT mode
   */
  static async unpublishHouse(houseId: string) {
    const house = await prisma.house.update({
      where: { id: houseId },
      data: {
        publishStatus: 'DRAFT',
      },
    });

    await prisma.floorPlan.updateMany({
      where: {
        floor: { houseId },
      },
      data: {
        publishStatus: 'DRAFT',
      },
    });

    return {
      success: true,
      house,
      publishStatus: 'DRAFT',
      message: 'Dashboard dikembalikan ke mode DRAFT (akses client ditutup).',
    };
  }
}

