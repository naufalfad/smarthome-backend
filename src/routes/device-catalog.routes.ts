import { Router } from 'express';
import {
  listDeviceCatalog,
  getDeviceCatalogById,
  getDeviceCatalogByType,
  getDeviceCapabilities,
  createDeviceCatalogItem,
  updateDeviceCatalogItem,
  deleteDeviceCatalogItem,
  uploadDevice3dModel,
  streamDevice3dModel,
} from '../controllers/device-catalog.controller.js';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware.js';
import { uploadCatalog3dGlb } from '../middlewares/upload.middleware.js';

const router = Router();

// GET /api/device-catalog
router.get('/', listDeviceCatalog);

// GET /api/device-catalog/by-type/:deviceType
router.get('/by-type/:deviceType', getDeviceCatalogByType);

// GET /api/device-catalog/by-type/:deviceType/capabilities
router.get('/by-type/:deviceType/capabilities', getDeviceCapabilities);

// Stream 3D GLB model for device
router.get('/:id/model-3d', streamDevice3dModel);

// GET /api/device-catalog/:id
router.get('/:id', getDeviceCatalogById);

// Super Admin Management Endpoints
router.post('/', authenticateToken, requireRole('SUPER_ADMIN'), createDeviceCatalogItem);
router.patch('/:id', authenticateToken, requireRole('SUPER_ADMIN'), updateDeviceCatalogItem);
router.delete('/:id', authenticateToken, requireRole('SUPER_ADMIN'), deleteDeviceCatalogItem);
router.post(
  '/:id/model-3d',
  authenticateToken,
  requireRole('SUPER_ADMIN'),
  uploadCatalog3dGlb.single('file'),
  uploadDevice3dModel
);

export default router;

