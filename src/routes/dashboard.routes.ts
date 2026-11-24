import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

// Mounted under /api/dashboard
router.get('/', DashboardController.getOverview);
router.get('/overview', DashboardController.getOverview);
router.get('/floors', DashboardController.getFloors);
router.get('/rooms', DashboardController.getRooms);
router.get('/devices', DashboardController.getDevices);
router.get('/activities', DashboardController.getActivities);
router.get('/automation-summary', DashboardController.getAutomationSummary);
router.post(
  '/devices/:deviceId/control',
  validateUuidParam('deviceId'),
  commandAndUploadLimiter,
  DashboardController.controlDevice
);

export default router;

