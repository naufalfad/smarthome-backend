import { Router } from 'express';
import {
  getIdentificationsOverview,
  getIdentificationTree,
  getIdentifications,
  getIdentificationByNode,
  upsertIdentification,
  patchIdentification,
  bulkUpdateIdentifications,
  revalidateIdentifications,
} from '../controllers/node-identification.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';

// MergeParams: true allows accessing :id from parent router (/api/house-models/:id/identifications)
const router = Router({ mergeParams: true });

// Overview stats (GET /api/house-models/:id/identifications/overview)
router.get('/overview', getIdentificationsOverview);

// Hierarchical tree with identification state (GET /api/house-models/:id/identifications/tree)
router.get('/tree', getIdentificationTree);

// List of all node identifications (GET /api/house-models/:id/identifications)
router.get('/', getIdentifications);

// Single node identification (GET /api/house-models/:id/identifications/:nodeName)
router.get('/:nodeName', getIdentificationByNode);

// Create or update single node identification (POST /api/house-models/:id/identifications) - Super Admin only
router.post('/', requireRole('SUPER_ADMIN'), upsertIdentification);

// Update single node identification (PATCH /api/house-models/:id/identifications/:nodeName) - Super Admin only
router.patch('/:nodeName', requireRole('SUPER_ADMIN'), patchIdentification);

// Bulk confirm or preview identifications (POST /api/house-models/:id/identifications/bulk) - Super Admin only
router.post('/bulk', requireRole('SUPER_ADMIN'), bulkUpdateIdentifications);

// Trigger revalidation against GLB structure (POST /api/house-models/:id/identifications/revalidate) - Super Admin only
router.post('/revalidate', requireRole('SUPER_ADMIN'), revalidateIdentifications);

export default router;

