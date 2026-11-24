import { Request, Response } from 'express';
import { RoomService } from '../services/room.service.js';
import { sendError, sendSuccess } from '../utils/response.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export class RoomController {
  /**
   * GET /api/floors/:floorId/rooms
   */
  static async listByFloor(req: Request, res: Response) {
    try {
      const floorId = req.params.floorId as string;
      await PropertyAccessPolicy.assertCanAccessFloor(req.user, floorId, { requireActive: true });
      const rooms = await RoomService.listRoomsByFloor(floorId);
      return sendSuccess(res, 'Rooms retrieved successfully', rooms);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 400;
      return sendError(res, error.message || 'Failed to retrieve rooms', null, status);
    }
  }

  /**
   * POST /api/floors/:floorId/rooms
   */
  static async create(req: Request, res: Response) {
    try {
      const floorId = req.params.floorId as string;
      await PropertyAccessPolicy.assertCanEditFloor(req.user, floorId);
      const { name, type, color, polygonCoordinates } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return sendError(res, 'Room name is required and must be a non-empty string', null, 400);
      }

      const room = await RoomService.createRoom(floorId, {
        name,
        type,
        color,
        polygonCoordinates,
      });

      return sendSuccess(res, 'Room created successfully', room, 201);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 400;
      return sendError(res, error.message || 'Failed to create room', null, status);
    }
  }

  /**
   * GET /api/rooms/:id
   */
  static async getById(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await PropertyAccessPolicy.assertCanAccessRoom(req.user, id, { requireActive: true });
      const room = await RoomService.getRoomById(id);
      return sendSuccess(res, 'Room details retrieved successfully', room);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to retrieve room', null, status);
    }
  }

  /**
   * PATCH /api/rooms/:id
   */
  static async update(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await PropertyAccessPolicy.assertCanEditRoom(req.user, id);
      const { name, type, color, isActive } = req.body;

      const room = await RoomService.updateRoom(id, {
        name,
        type,
        color,
        isActive,
      });

      return sendSuccess(res, 'Room updated successfully', room);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to update room', null, status);
    }
  }

  /**
   * PATCH /api/rooms/:id/polygon
   */
  static async updatePolygon(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await PropertyAccessPolicy.assertCanEditRoom(req.user, id);
      const { polygonCoordinates } = req.body;

      if (!polygonCoordinates) {
        return sendError(res, 'polygonCoordinates array is required', null, 400);
      }

      const result = await RoomService.updateRoomPolygon(id, polygonCoordinates);
      return sendSuccess(res, 'Room polygon updated successfully', result);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to update room polygon', null, status);
    }
  }

  /**
   * PATCH /api/rooms/:id/color
   */
  static async updateColor(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await PropertyAccessPolicy.assertCanEditRoom(req.user, id);
      const { color } = req.body;

      if (!color || typeof color !== 'string') {
        return sendError(res, 'color hex or css string is required', null, 400);
      }

      const room = await RoomService.updateRoomColor(id, color);
      return sendSuccess(res, 'Room color updated successfully', room);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to update room color', null, status);
    }
  }

  /**
   * DELETE /api/rooms/:id
   */
  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      await PropertyAccessPolicy.assertCanEditRoom(req.user, id);
      const room = await RoomService.deleteRoom(id);
      return sendSuccess(res, 'Room deleted successfully', room);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to delete room', null, status);
    }
  }

  /**
   * PATCH /api/floor-plans/:floorPlanId/objects/:objectId/room
   */
  static async assignObjectRoom(req: Request, res: Response) {
    try {
      const floorPlanId = (req.params.floorPlanId || req.params.id) as string;
      await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
      const objectId = req.params.objectId as string;
      const { roomId } = req.body; // string or null

      const updated = await RoomService.assignObjectToRoom(floorPlanId, objectId, roomId || null);
      return sendSuccess(res, 'Object room assignment updated successfully', updated);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : error.message?.includes('not found') ? 404 : 400;
      return sendError(res, error.message || 'Failed to assign object to room', null, status);
    }
  }

  /**
   * GET /api/floor-plans/:floorPlanId/spatial-detect
   */
  static async spatialDetect(req: Request, res: Response) {
    try {
      const floorPlanId = (req.params.floorPlanId || req.params.id) as string;
      await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
      const result = await RoomService.detectObjectsInRooms(floorPlanId);
      return sendSuccess(res, 'Spatial room detection completed successfully', result);
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 400;
      return sendError(res, error.message || 'Failed to perform spatial detection', null, status);
    }
  }
}
