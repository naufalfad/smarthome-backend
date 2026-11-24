import { Router } from 'express';
import {
  getEngineStatus,
  getDeviceState,
  getDeviceTelemetry,
  getFloorPlanTelemetry,
  controlDevice,
} from '../controllers/simulation.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';

const simulationRoutes = Router();

// Engine operational health & metrics (Super Admin)
simulationRoutes.get('/status', getEngineStatus);

// Convenience simulation endpoints
simulationRoutes.get('/devices/:id/state', validateUuidParam('id'), getDeviceState);
simulationRoutes.get('/devices/:id/telemetry', validateUuidParam('id'), getDeviceTelemetry);
simulationRoutes.post(
  '/devices/:id/control',
  validateUuidParam('id'),
  commandAndUploadLimiter,
  controlDevice
);
simulationRoutes.get(
  '/floor-plans/:floorPlanId/latest',
  validateUuidParam('floorPlanId'),
  getFloorPlanTelemetry
);

export default simulationRoutes;
