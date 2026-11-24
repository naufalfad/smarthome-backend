import { Router } from 'express';
import {
  getClientDashboard,
  controlDevice,
} from '../controllers/client-portal.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';

const router = Router();

// Mounted under /api/client
router.get('/houses/:houseId', validateUuidParam('houseId'), getClientDashboard);
router.post(
  '/houses/:houseId/devices/:deviceId/control',
  validateUuidParam('houseId', 'deviceId'),
  commandAndUploadLimiter,
  controlDevice
);

export default router;
