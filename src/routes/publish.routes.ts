import { Router } from 'express';
import {
  getPublishStatus,
  publishHouse,
  previewHouse,
  unpublishHouse,
} from '../controllers/publish.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

// Mounted under /api/publish - Administrative floor plan publication (Super Admin only)
router.use(requireRole('SUPER_ADMIN'));

router.get('/houses/:houseId/status', validateUuidParam('houseId'), getPublishStatus);
router.post('/houses/:houseId/publish', validateUuidParam('houseId'), publishHouse);
router.post('/houses/:houseId/preview', validateUuidParam('houseId'), previewHouse);
router.post('/houses/:houseId/unpublish', validateUuidParam('houseId'), unpublishHouse);

export default router;

