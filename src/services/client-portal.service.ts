import { prisma } from './db.service.js';
import { DeviceManagementService } from './device-management.service.js';

export class ClientPortalService {
  /**
   * Get client view data for a specific house
   */
  static async getClientDashboard(houseId: string) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      include: {
        floors: {
          orderBy: { levelNumber: 'asc' },
          include: {
            floorPlan: true,
            rooms: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                polygonCoordinates: true,
              },
            },
          },
        },
        devices: {
          orderBy: { createdAt: 'asc' },
          include: {
            room: {
              select: { id: true, name: true, type: true, color: true },
            },
            floor: {
              select: { id: true, name: true, levelNumber: true },
            },
          },
        },
      },
    });

    if (!house) {
      throw new Error(`House with id '${houseId}' not found.`);
    }

    const isPublished = house.publishStatus === 'PUBLISHED';

    if (!isPublished) {
      return {
        isPublished: false,
        publishStatus: house.publishStatus || 'DRAFT',
        houseId: house.id,
        houseName: house.name,
        clientName: house.clientName,
        message: 'Dashboard Smart Home ini sedang dalam tahap konfigurasi/DRAFT oleh Administrator dan belum dipublikasikan.',
      };
    }

    return {
      isPublished: true,
      publishStatus: 'PUBLISHED',
      publishedAt: house.publishedAt,
      house: {
        id: house.id,
        name: house.name,
        description: house.description,
        clientName: house.clientName,
        clientEmail: house.clientEmail,
        floors: house.floors.map((f) => ({
          id: f.id,
          name: f.name,
          levelNumber: f.levelNumber,
          floorPlan: f.floorPlan
            ? {
                id: f.floorPlan.id,
                name: f.floorPlan.name,
                imagePath: f.floorPlan.imagePath,
                imageWidth: f.floorPlan.imageWidth,
                imageHeight: f.floorPlan.imageHeight,
                viewBoxWidth: f.floorPlan.viewBoxWidth,
                viewBoxHeight: f.floorPlan.viewBoxHeight,
                backgroundOpacity: f.floorPlan.backgroundOpacity,
                isBackgroundVisible: f.floorPlan.isBackgroundVisible,
              }
            : null,
          rooms: f.rooms,
        })),
        devices: house.devices.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          status: d.status,
          integrationStatus: d.integrationStatus,
          x: d.x,
          y: d.y,
          normalizedX: d.normalizedX,
          normalizedY: d.normalizedY,
          rotation: d.rotation,
          iconWidth: d.iconWidth,
          iconHeight: d.iconHeight,
          manualRoomName: d.manualRoomName || d.room?.name || null,
          roomId: d.roomId,
          floorId: d.floorId,
          floorPlanId: d.floorPlanId,
          configuration: d.configuration,
          room: d.room,
          floor: d.floor,
        })),
      },
    };
  }

  /**
   * Client device interaction (control device in published dashboard)
   */
  static async controlDevice(houseId: string, deviceId: string, command: { action: string; payload?: any }) {
    const house = await prisma.house.findUnique({
      where: { id: houseId },
      select: { publishStatus: true },
    });

    if (!house || house.publishStatus !== 'PUBLISHED') {
      throw new Error('Akses kontrol ditolak: Dashboard belum dipublikasikan untuk client.');
    }

    const device = await prisma.device.findFirst({
      where: { id: deviceId, houseId },
    });

    if (!device) {
      throw new Error(`Perangkat dengan id '${deviceId}' tidak ditemukan di rumah ini.`);
    }

    // Route through Phase 6 standardized command pipeline & Virtual Device Provider
    let commandType = command.action;
    let payload = command.payload || {};

    if (command.action === 'TOGGLE_POWER') {
      const nextPower = device.status !== 'ON';
      commandType = 'SET_POWER';
      payload = { power: nextPower, status: nextPower ? 'ON' : 'OFF' };
    } else if (command.action === 'TOGGLE_LOCK') {
      const isCurrentlyLocked = device.status === 'LOCKED';
      commandType = isCurrentlyLocked ? 'UNLOCK' : 'LOCK';
      payload = { lockState: isCurrentlyLocked ? 'UNLOCKED' : 'LOCKED' };
    }

    await DeviceManagementService.executeCommand(deviceId, {
      commandType,
      payload,
    });

    const updated = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        room: true,
        floor: true,
        catalogItem: true,
      },
    });

    if (!updated) {
      throw new Error(`Device with id '${deviceId}' not found after command execution.`);
    }

    return updated;
  }
}

