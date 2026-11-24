import { Router } from 'express';
import { RoomController } from '../controllers/room.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

export const roomRouter = Router();

// Room CRUD & Polygon
roomRouter.get('/:id', validateUuidParam('id'), RoomController.getById);
roomRouter.patch('/:id', validateUuidParam('id'), RoomController.update);
roomRouter.patch('/:id/polygon', validateUuidParam('id'), RoomController.updatePolygon);
roomRouter.patch('/:id/color', validateUuidParam('id'), RoomController.updateColor);
roomRouter.delete('/:id', validateUuidParam('id'), RoomController.delete);

// Floor-level room routes router (mounted on /api/floors/:floorId/rooms)
export const floorRoomsRouter = Router({ mergeParams: true });
floorRoomsRouter.get('/', validateUuidParam('floorId'), RoomController.listByFloor);
floorRoomsRouter.post('/', validateUuidParam('floorId'), RoomController.create);
