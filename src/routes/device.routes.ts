import { Router } from 'express';
import {
  listFloorPlanDevices,
  createDevice,
  getDeviceById,
  updateDevice,
  updateDeviceConfiguration,
  deleteDevice,
  updateTelemetry,
  executeStandardizedCommand,
  getDeviceCommandHistory,
  getDeviceProviderState,
  listFloorPlanDevicesEnriched,
} from '../controllers/device.controller.js';
import {
  getDeviceState,
  getDeviceTelemetry,
  controlDevice,
} from '../controllers/simulation.controller.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

export const deviceRouter = Router();
export const floorPlanDevicesRouter = Router({ mergeParams: true });

// Mounted under /api/devices
deviceRouter.get('/:id', validateUuidParam('id'), getDeviceById);
deviceRouter.patch('/:id', validateUuidParam('id'), updateDevice);
deviceRouter.patch('/:id/configuration', validateUuidParam('id'), updateDeviceConfiguration);
deviceRouter.delete('/:id', validateUuidParam('id'), deleteDevice);
deviceRouter.patch('/:id/telemetry', validateUuidParam('id'), updateTelemetry);

// Simulation & Live Telemetry Endpoints (Phase 5)
deviceRouter.get('/:id/state', validateUuidParam('id'), getDeviceState);
deviceRouter.get('/:id/telemetry', validateUuidParam('id'), getDeviceTelemetry);
deviceRouter.post('/:id/control', validateUuidParam('id'), commandAndUploadLimiter, controlDevice);

// Standardized Command & Provider Layer Endpoints (Phase 6)
deviceRouter.post('/:id/command', validateUuidParam('id'), commandAndUploadLimiter, executeStandardizedCommand);
deviceRouter.get('/:id/commands', validateUuidParam('id'), getDeviceCommandHistory);
deviceRouter.get('/:id/provider-state', validateUuidParam('id'), getDeviceProviderState);

// Mounted under /api/floor-plans/:floorPlanId/devices
floorPlanDevicesRouter.get('/', validateUuidParam('floorPlanId'), listFloorPlanDevices);
floorPlanDevicesRouter.get('/enriched', validateUuidParam('floorPlanId'), listFloorPlanDevicesEnriched);
floorPlanDevicesRouter.post('/', validateUuidParam('floorPlanId'), createDevice);
