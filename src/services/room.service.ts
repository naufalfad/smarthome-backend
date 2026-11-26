import { RoomType } from '@prisma/client';
import { prisma } from './db.service.js';
import {
  calculateAreaInSquareMeters,
  calculatePolygonArea,
  isPointInPolygon,
  Point,
  validatePolygonCoordinates,
} from '../utils/geometry.js';

export interface CreateRoomDto {
  name: string;
  type?: RoomType;
  color?: string;
  polygonCoordinates?: Point[];
  ceilingHeight?: number;
}

export interface UpdateRoomDto {
  name?: string;
  type?: RoomType;
  color?: string;
  ceilingHeight?: number;
  isActive?: boolean;
}

export class RoomService {
  /**
   * List all rooms on a specific floor with linked objects count and details
   */
  static async listRoomsByFloor(floorId: string) {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
    });
    if (!floor) {
      throw new Error(`Floor with id '${floorId}' not found.`);
    }

    return prisma.room.findMany({
      where: { floorId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        floorPlanObjects: {
          select: {
            id: true,
            name: true,
            category: true,
            x: true,
            y: true,
            width: true,
            height: true,
          },
        },
        _count: {
          select: { floorPlanObjects: true },
        },
      },
    });
  }

  /**
   * Get single room by ID
   */
  static async getRoomById(id: string) {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        floorRel: {
          include: {
            house: true,
            floorPlan: true,
          },
        },
        floorPlanObjects: {
          select: {
            id: true,
            name: true,
            category: true,
            x: true,
            y: true,
            width: true,
            height: true,
            rotation: true,
          },
        },
        _count: {
          select: { floorPlanObjects: true, devices: true },
        },
      },
    });

    if (!room) {
      throw new Error(`Room with id '${id}' not found.`);
    }

    return room;
  }

  /**
   * Create a new room on a floor
   */
  static async createRoom(floorId: string, data: CreateRoomDto) {
    const floor = await prisma.floor.findUnique({
      where: { id: floorId },
      include: { floorPlan: true },
    });
    if (!floor) {
      throw new Error(`Floor with id '${floorId}' not found.`);
    }

    let sanitizedCoords: Point[] | null = null;
    let areaM2: number | null = null;

    if (data.polygonCoordinates && data.polygonCoordinates.length > 0) {
      const validation = validatePolygonCoordinates(data.polygonCoordinates);
      if (!validation.valid || !validation.sanitized) {
        throw new Error(validation.error || 'Invalid polygon coordinates.');
      }
      sanitizedCoords = validation.sanitized;
      const areaPx = calculatePolygonArea(sanitizedCoords);
      areaM2 = calculateAreaInSquareMeters(areaPx, floor.floorPlan?.pixelsPerMeter);
    }

    // Default color palette for rooms
    const defaultColors = [
      '#6366F1', // Indigo
      '#3B82F6', // Blue
      '#10B981', // Emerald
      '#F59E0B', // Amber
      '#EC4899', // Pink
      '#8B5CF6', // Purple
      '#14B8A6', // Teal
      '#F97316', // Orange
    ];
    const existingCount = await prisma.room.count({ where: { floorId } });
    const color = data.color || defaultColors[existingCount % defaultColors.length];

    return prisma.room.create({
      data: {
        floorId,
        floor: floor.levelNumber,
        name: data.name.trim(),
        type: data.type || RoomType.OTHER,
        color,
        polygonCoordinates: sanitizedCoords ? (sanitizedCoords as any) : undefined,
        areaSquareMeters: areaM2,
        ceilingHeight: data.ceilingHeight != null ? Math.max(Number(data.ceilingHeight), 1.0) : 3.0,
        isActive: true,
      },
      include: {
        floorPlanObjects: true,
        _count: {
          select: { floorPlanObjects: true },
        },
      },
    });
  }

  /**
   * Update room metadata
   */
  static async updateRoom(id: string, data: UpdateRoomDto) {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Room with id '${id}' not found.`);
    }

    return prisma.room.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.ceilingHeight !== undefined && { ceilingHeight: Math.max(Number(data.ceilingHeight), 1.0) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: {
        floorPlanObjects: true,
        _count: {
          select: { floorPlanObjects: true },
        },
      },
    });
  }

  /**
   * Update room polygon coordinates, recalculates area, and inspects linked objects for boundaries
   */
  static async updateRoomPolygon(id: string, polygonCoordinates: Point[]) {
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        floorRel: {
          include: { floorPlan: true },
        },
        floorPlanObjects: true,
      },
    });

    if (!room) {
      throw new Error(`Room with id '${id}' not found.`);
    }

    const validation = validatePolygonCoordinates(polygonCoordinates);
    if (!validation.valid || !validation.sanitized) {
      throw new Error(validation.error || 'Invalid polygon coordinates.');
    }

    const sanitized = validation.sanitized;
    const areaPx = calculatePolygonArea(sanitized);
    const areaM2 = calculateAreaInSquareMeters(areaPx, room.floorRel?.floorPlan?.pixelsPerMeter);

    // Check which currently linked objects fall outside the new polygon
    const orphanedObjects = (room.floorPlanObjects || []).filter((obj) => {
      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;
      return !isPointInPolygon({ x: centerX, y: centerY }, sanitized);
    });

    const updated = await prisma.room.update({
      where: { id },
      data: {
        polygonCoordinates: sanitized as any,
        areaSquareMeters: areaM2,
      },
      include: {
        floorPlanObjects: true,
        _count: {
          select: { floorPlanObjects: true },
        },
      },
    });

    return {
      room: updated,
      areaPx,
      areaSquareMeters: areaM2,
      orphanedObjects: orphanedObjects.map((o) => ({
        id: o.id,
        name: o.name,
        category: o.category,
      })),
      hasOrphanedObjects: orphanedObjects.length > 0,
    };
  }

  /**
   * Update room color
   */
  static async updateRoomColor(id: string, color: string) {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Room with id '${id}' not found.`);
    }

    return prisma.room.update({
      where: { id },
      data: { color },
    });
  }

  /**
   * Delete room: disconnects linked objects and removes room
   */
  static async deleteRoom(id: string) {
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Room with id '${id}' not found.`);
    }

    // Unassign linked objects first to maintain clean data integrity
    await prisma.floorPlanObject.updateMany({
      where: { roomId: id },
      data: { roomId: null },
    });

    return prisma.room.delete({
      where: { id },
    });
  }

  /**
   * Assign or unassign object to a room with strict cross-floor validation
   */
  static async assignObjectToRoom(floorPlanId: string, objectId: string, roomId: string | null) {
    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
    });
    if (!plan) {
      throw new Error(`Floor plan with id '${floorPlanId}' not found.`);
    }

    const object = await prisma.floorPlanObject.findFirst({
      where: { id: objectId, floorPlanId },
    });
    if (!object) {
      throw new Error(`Object with id '${objectId}' not found in floor plan '${floorPlanId}'.`);
    }

    if (roomId) {
      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });
      if (!room) {
        throw new Error(`Room with id '${roomId}' not found.`);
      }

      if (room.floorId && room.floorId !== plan.floorId) {
        throw new Error(
          `Room '${room.name}' belongs to floor '${room.floorId}', but object is placed on floor '${plan.floorId}'. Cross-floor room assignment is prohibited.`
        );
      }
    }

    return prisma.floorPlanObject.update({
      where: { id: objectId },
      data: { roomId },
      include: {
        catalogObject: true,
        room: true,
      },
    });
  }

  /**
   * Spatially detect which rooms contain objects in a floor plan
   */
  static async detectObjectsInRooms(floorPlanId: string) {
    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
      include: {
        objects: true,
        floor: {
          include: {
            rooms: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new Error(`Floor plan with id '${floorPlanId}' not found.`);
    }

    const roomsWithPolygons = (plan.floor.rooms || []).filter(
      (r) =>
        r.polygonCoordinates &&
        Array.isArray(r.polygonCoordinates) &&
        (r.polygonCoordinates as any[]).length >= 3
    );

    const detections = plan.objects.map((obj) => {
      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;
      const center: Point = { x: centerX, y: centerY };

      let detectedRoom: (typeof plan.floor.rooms)[0] | null = null;

      for (const room of roomsWithPolygons) {
        const poly = room.polygonCoordinates as unknown as Point[];
        if (isPointInPolygon(center, poly)) {
          detectedRoom = room;
          break; // First containing room
        }
      }

      return {
        objectId: obj.id,
        objectName: obj.name,
        category: obj.category,
        x: obj.x,
        y: obj.y,
        center,
        currentRoomId: obj.roomId,
        detectedRoomId: detectedRoom ? detectedRoom.id : null,
        detectedRoomName: detectedRoom ? detectedRoom.name : null,
        isMatched: obj.roomId === (detectedRoom ? detectedRoom.id : null),
      };
    });

    return {
      floorPlanId,
      totalObjects: plan.objects.length,
      detections,
    };
  }

  /**
   * Recalculate room areas for a floor when floor plan calibration changes
   */
  static async recalculateRoomAreas(floorId: string, pixelsPerMeter: number | null | undefined) {
    const rooms = await prisma.room.findMany({
      where: { floorId },
    });

    for (const room of rooms) {
      let coords: any = room.polygonCoordinates;
      if (typeof coords === 'string') {
        try {
          coords = JSON.parse(coords);
        } catch {
          coords = null;
        }
      }

      if (coords && Array.isArray(coords)) {
        const points = coords as unknown as Point[];
        if (points.length >= 3) {
          const areaPx = calculatePolygonArea(points);
          const areaM2 = calculateAreaInSquareMeters(areaPx, pixelsPerMeter);
          await prisma.room.update({
            where: { id: room.id },
            data: { areaSquareMeters: areaM2 },
          });
        }
      }
    }
  }
}

