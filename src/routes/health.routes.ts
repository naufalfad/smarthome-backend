import { Router } from 'express';
import {
  getHealth,
  getLiveness,
  getReadinessStatus,
  getWorkersStatus,
  getFullHealthStatus,
  getDatabaseHealth,
} from '../controllers/health.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Public minimal health & liveness probes (safe, non-sensitive)
router.get('/', getHealth);
router.get('/live', getLiveness);

// Internal/Restricted diagnostic endpoints (require valid authentication)
router.get('/ready', authenticateToken, getReadinessStatus);
router.get('/workers', authenticateToken, getWorkersStatus);
router.get('/full', authenticateToken, getFullHealthStatus);
router.get('/db', authenticateToken, getDatabaseHealth);

export default router;

