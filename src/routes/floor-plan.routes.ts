import { Router } from 'express';
import {
  getPlanByFloor,
  getPlanById,
  updatePlanConfig,
  uploadBackground,
  deleteBackground,
  streamBackgroundImage,
  saveCalibration,
  resetCalibration,
  rotatePlan,
  listObjects,
  createObject,
  updateObject,
  deleteObject,
  duplicateObject,
  batchUpdateObjects,
} from '../controllers/floor-plan.controller.js';
import { RoomController } from '../controllers/room.controller.js';
import { getFloorPlanTelemetry } from '../controllers/simulation.controller.js';
import { uploadFloorPlanBackground } from '../middlewares/floor-plan-upload.middleware.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

// Floor plans by floor
router.get('/by-floor/:floorId', validateUuidParam('floorId'), getPlanByFloor);

// Floor plan entity
router.get('/:id', validateUuidParam('id'), getPlanById);
router.patch('/:id', validateUuidParam('id'), updatePlanConfig);
router.get('/:id/telemetry/latest', validateUuidParam('id'), getFloorPlanTelemetry);

// Background management
router.post(
  '/:id/background',
  validateUuidParam('id'),
  commandAndUploadLimiter,
  uploadFloorPlanBackground.single('image'),
  uploadBackground
);
router.delete('/:id/background', validateUuidParam('id'), deleteBackground);
router.get('/:id/image', validateUuidParam('id'), streamBackgroundImage);

// Scale calibration
router.post('/:id/calibration', validateUuidParam('id'), saveCalibration);
router.delete('/:id/calibration', validateUuidParam('id'), resetCalibration);

// Floor plan orientation rotation (90 degrees clockwise)
router.post('/:id/rotate', validateUuidParam('id'), rotatePlan);

// Phase 3: Spatial Detection & Room Assignment
router.get('/:id/spatial-detect', validateUuidParam('id'), RoomController.spatialDetect);
router.patch(
  '/:id/objects/:objectId/room',
  validateUuidParam('id', 'objectId'),
  RoomController.assignObjectRoom
);

// Objects within a floor plan
router.get('/:id/objects', validateUuidParam('id'), listObjects);
router.post('/:id/objects', validateUuidParam('id'), createObject);
router.patch('/:id/objects/:objectId', validateUuidParam('id', 'objectId'), updateObject);
router.delete('/:id/objects/:objectId', validateUuidParam('id', 'objectId'), deleteObject);
router.post('/:id/objects/:objectId/duplicate', validateUuidParam('id', 'objectId'), duplicateObject);
router.put('/:id/objects/batch', validateUuidParam('id'), batchUpdateObjects);

export default router;

