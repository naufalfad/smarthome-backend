import { prisma } from './db.service.js';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { getImageDimensions } from '../utils/image-dimensions.js';
import { resolveUploadPath, syncFileToAllUploadDirs, getHouseFloorPlanDirectory } from '../utils/storage-path.util.js';
import { RoomService } from './room.service.js';

export interface CreateObjectDto {
  catalogObjectId?: string;
  name: string;
  category: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  roomId?: string;
  properties?: Record<string, any>;
}

export interface UpdateObjectDto {
  name?: string;
  category?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  zIndex?: number;
  roomId?: string | null;
  properties?: Record<string, any>;
}

export interface CalibrationDto {
  point1: { x: number; y: number };
  point2: { x: number; y: number };
  distanceMeters: number;
}

export class FloorPlanService {
  /**
   * Get or create floor plan for a specific floor (atomic upsert safe against race conditions)
   */
  static async getPlanByFloorId(floorId: string) {
    const floor = await prisma.floor.findUnique({ where: { id: floorId } });
    if (!floor) {
      throw new Error(`Floor with id '${floorId}' not found.`);
    }

    return prisma.floorPlan.upsert({
      where: { floorId },
      update: {},
      create: {
        floorId,
        name: `${floor.name} Plan`,
        viewBoxWidth: 1600,
        viewBoxHeight: 1000,
      },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });
  }

  static async getPlanById(id: string) {
    return prisma.floorPlan.findUnique({
      where: { id },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });
  }

  static async updatePlanConfig(
    id: string,
    data: {
      name?: string;
      viewBoxX?: number;
      viewBoxY?: number;
      viewBoxWidth?: number;
      viewBoxHeight?: number;
      backgroundOpacity?: number;
      isBackgroundVisible?: boolean;
      gridSnap?: boolean;
    }
  ) {
    return prisma.floorPlan.update({
      where: { id },
      data,
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });
  }

  /**
   * Upload / replace background image without altering existing objects
   */
  static async setBackground(id: string, file: Express.Multer.File) {
    const plan = await prisma.floorPlan.findUnique({
      where: { id },
      include: { floor: true },
    });
    if (!plan || !plan.floor) {
      // Remove uploaded file if plan not found
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw new Error(`Floor plan with id '${id}' not found.`);
    }

    const houseId = plan.floor.houseId;

    // If an existing background exists on disk, clean it up
    if (plan.imagePath) {
      const oldPath = resolveUploadPath(plan.imagePath);
      if (oldPath && fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch (e) {
          console.warn('Could not remove previous background file:', e);
        }
      }
    }

    // Inspect natural dimensions of uploaded image
    const { width, height, mimeType } = getImageDimensions(file.path);
    const fileName = file.filename || path.basename(file.path);

    // Scoped containment: backend/uploads/floor-plans/{houseId}/
    const targetDir = getHouseFloorPlanDirectory(houseId);
    const targetPath = path.join(targetDir, fileName);

    // Move file into scoped house directory if not already there
    if (path.resolve(file.path) !== path.resolve(targetPath)) {
      fs.copyFileSync(file.path, targetPath);
      try {
        fs.unlinkSync(file.path);
      } catch {}
    }

    const relativeImagePath = `uploads/floor-plans/${houseId}/${fileName}`;

    // Ensure synced across backend and root upload directories
    syncFileToAllUploadDirs(`${houseId}/${fileName}`, targetPath);

    return prisma.floorPlan.update({
      where: { id },
      data: {
        imagePath: relativeImagePath,
        imageWidth: width,
        imageHeight: height,
        imageSize: file.size,
        imageMimeType: mimeType,
        viewBoxWidth: width > 0 ? width : 1600,
        viewBoxHeight: height > 0 ? height : 1000,
        isBackgroundVisible: true,
      },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });
  }

  /**
   * Delete background image while leaving all objects untouched
   */
  static async deleteBackground(id: string) {
    const plan = await prisma.floorPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new Error(`Floor plan with id '${id}' not found.`);
    }

    if (plan.imagePath) {
      const filePath = resolveUploadPath(plan.imagePath);
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('Could not remove background file:', e);
        }
      }
    }

    const updated = await prisma.floorPlan.update({
      where: { id },
      data: {
        imagePath: null,
        imageWidth: null,
        imageHeight: null,
        imageSize: null,
        imageMimeType: null,
        isCalibrated: false,
        pixelsPerMeter: null,
        calibrationPoints: undefined,
        viewBoxWidth: 1600,
        viewBoxHeight: 1000,
      },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });

    await RoomService.recalculateRoomAreas(updated.floorId, null);

    return updated;
  }

  /**
   * Set 2-point scale calibration
   */
  static async saveCalibration(id: string, calibration: CalibrationDto) {
    const { point1, point2, distanceMeters } = calibration;
    if (distanceMeters <= 0) {
      throw new Error('Distance in meters must be greater than zero.');
    }

    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    if (pixelDistance <= 0.001) {
      throw new Error('Calibration points cannot be at the exact same position.');
    }

    const pixelsPerMeter = pixelDistance / distanceMeters;

    const updated = await prisma.floorPlan.update({
      where: { id },
      data: {
        pixelsPerMeter,
        isCalibrated: true,
        calibrationPoints: {
          point1,
          point2,
          distanceMeters,
          pixelDistance,
        },
      },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });

    await RoomService.recalculateRoomAreas(updated.floorId, pixelsPerMeter);

    return updated;
  }

  /**
   * Reset / clear 2-point scale calibration and revert to default pixelsPerMeter (50.0)
   */
  static async resetCalibration(id: string) {
    const updated = await prisma.floorPlan.update({
      where: { id },
      data: {
        pixelsPerMeter: 50.0,
        isCalibrated: false,
        calibrationPoints: Prisma.DbNull,
      },
      include: {
        floor: {
          include: {
            house: true,
          },
        },
        objects: {
          orderBy: { zIndex: 'asc' },
          include: {
            catalogObject: true,
          },
        },
      },
    });

    await RoomService.recalculateRoomAreas(updated.floorId, 50.0);

    return updated;
  }

  // ==========================================
  // OBJECT INSTANCE MANAGEMENT
  // ==========================================

  static async listObjects(floorPlanId: string) {
    return prisma.floorPlanObject.findMany({
      where: { floorPlanId },
      orderBy: { zIndex: 'asc' },
      include: {
        catalogObject: true,
      },
    });
  }

  static async createObject(floorPlanId: string, data: CreateObjectDto) {
    // 1. Verify FloorPlan exists and retrieve its floorId
    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });
    if (!plan) {
      throw new Error(`Floor plan with id '${floorPlanId}' not found.`);
    }

    // 2. Verify catalog item exists if supplied
    let width = data.width;
    let height = data.height;

    if (data.catalogObjectId) {
      const catalog = await prisma.objectCatalogItem.findUnique({
        where: { id: data.catalogObjectId },
      });
      if (!catalog) {
        throw new Error(`Object catalog item with id '${data.catalogObjectId}' not found.`);
      }
      width = width || catalog.defaultWidth;
      height = height || catalog.defaultHeight;
    }

    // 3. Verify Room belongs to the same Floor if supplied
    if (data.roomId) {
      const room = await prisma.room.findUnique({
        where: { id: data.roomId },
      });
      if (!room) {
        throw new Error(`Room with id '${data.roomId}' not found.`);
      }
      if (room.floorId && room.floorId !== plan.floorId) {
        throw new Error(
          `Room '${room.name}' belongs to floor '${room.floorId}', but object is placed on floor '${plan.floorId}'. Cross-floor room assignment is prohibited.`
        );
      }
    }

    // 4. Determine zIndex
    let zIndex = data.zIndex;
    if (zIndex === undefined) {
      const topObj = await prisma.floorPlanObject.findFirst({
        where: { floorPlanId },
        orderBy: { zIndex: 'desc' },
      });
      zIndex = topObj ? topObj.zIndex + 1 : 1;
    }

    return prisma.floorPlanObject.create({
      data: {
        floorPlanId,
        catalogObjectId: data.catalogObjectId,
        name: data.name,
        category: data.category,
        x: data.x,
        y: data.y,
        width: width || 80,
        height: height || 80,
        rotation: data.rotation || 0,
        zIndex,
        roomId: data.roomId,
        properties: data.properties || {},
      },
      include: {
        catalogObject: true,
      },
    });
  }

  static async updateObject(floorPlanId: string, objectId: string, data: UpdateObjectDto) {
    // 1. Verify object exists and belongs to floorPlanId
    const existing = await prisma.floorPlanObject.findFirst({
      where: { id: objectId, floorPlanId },
    });
    if (!existing) {
      throw new Error(`Object with id '${objectId}' not found in floor plan '${floorPlanId}'.`);
    }

    // 2. Verify Room belongs to the same Floor if roomId updated
    if (data.roomId) {
      const plan = await prisma.floorPlan.findUnique({ where: { id: floorPlanId } });
      const room = await prisma.room.findUnique({ where: { id: data.roomId } });
      if (!room) {
        throw new Error(`Room with id '${data.roomId}' not found.`);
      }
      if (room.floorId && plan && room.floorId !== plan.floorId) {
        throw new Error(
          `Room '${room.name}' belongs to floor '${room.floorId}', which does not match object floor '${plan.floorId}'.`
        );
      }
    }

    return prisma.floorPlanObject.update({
      where: { id: objectId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.x !== undefined && { x: data.x }),
        ...(data.y !== undefined && { y: data.y }),
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
        ...(data.rotation !== undefined && { rotation: data.rotation }),
        ...(data.zIndex !== undefined && { zIndex: data.zIndex }),
        ...(data.roomId !== undefined && { roomId: data.roomId }),
        ...(data.properties !== undefined && { properties: data.properties }),
      },
      include: {
        catalogObject: true,
      },
    });
  }

  static async deleteObject(floorPlanId: string, objectId: string) {
    // Verify object belongs to floorPlanId
    const existing = await prisma.floorPlanObject.findFirst({
      where: { id: objectId, floorPlanId },
    });
    if (!existing) {
      throw new Error(`Object with id '${objectId}' not found in floor plan '${floorPlanId}'.`);
    }

    return prisma.floorPlanObject.delete({
      where: { id: objectId },
    });
  }

  static async duplicateObject(floorPlanId: string, objectId: string) {
    const original = await prisma.floorPlanObject.findFirst({
      where: { id: objectId, floorPlanId },
    });
    if (!original) {
      throw new Error(`Object with id '${objectId}' not found in floor plan '${floorPlanId}'.`);
    }

    const topObj = await prisma.floorPlanObject.findFirst({
      where: { floorPlanId },
      orderBy: { zIndex: 'desc' },
    });
    const nextZIndex = topObj ? topObj.zIndex + 1 : original.zIndex + 1;

    return prisma.floorPlanObject.create({
      data: {
        floorPlanId,
        catalogObjectId: original.catalogObjectId,
        name: `${original.name} (Copy)`,
        category: original.category,
        x: original.x + 25,
        y: original.y + 25,
        width: original.width,
        height: original.height,
        rotation: original.rotation,
        zIndex: nextZIndex,
        roomId: original.roomId,
        properties: original.properties || {},
      },
      include: {
        catalogObject: true,
      },
    });
  }

  /**
   * Batch update positions / transformations or zIndices with strict floorPlan ownership enforcement
   */
  static async batchUpdateObjects(
    floorPlanId: string,
    updates: Array<{ id: string } & UpdateObjectDto>
  ) {
    if (updates.length === 0) return [];

    // Verify all targets belong to this floorPlanId
    const targetIds = updates.map((u) => u.id);
    const existingObjs = await prisma.floorPlanObject.findMany({
      where: {
        id: { in: targetIds },
        floorPlanId,
      },
    });

    if (existingObjs.length !== targetIds.length) {
      const foundIds = new Set(existingObjs.map((o) => o.id));
      const unauthorized = targetIds.filter((id) => !foundIds.has(id));
      throw new Error(
        `Batch update rejected: Objects [${unauthorized.join(', ')}] do not belong to floor plan '${floorPlanId}'.`
      );
    }

    const results = [];
    for (const update of updates) {
      const { id, ...data } = update;
      const updated = await prisma.floorPlanObject.update({
        where: { id },
        data: {
          ...(data.x !== undefined && { x: data.x }),
          ...(data.y !== undefined && { y: data.y }),
          ...(data.width !== undefined && { width: data.width }),
          ...(data.height !== undefined && { height: data.height }),
          ...(data.rotation !== undefined && { rotation: data.rotation }),
          ...(data.zIndex !== undefined && { zIndex: data.zIndex }),
          ...(data.name !== undefined && { name: data.name }),
        },
        include: {
          catalogObject: true,
        },
      });
      results.push(updated);
    }
    return results;
  }
}

