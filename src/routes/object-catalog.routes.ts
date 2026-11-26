import { Router } from 'express';
import {
  listCatalogItems,
  getCatalogCategories,
  getCatalogItemById,
  streamCatalogAsset,
  createObjectCatalogItem,
  updateObjectCatalogItem,
  deleteObjectCatalogItem,
  uploadObject3dModel,
  streamObject3dModel,
} from '../controllers/object-catalog.controller.js';
import { authenticateToken, requireRole } from '../middlewares/auth.middleware.js';
import { uploadCatalog3dGlb } from '../middlewares/upload.middleware.js';

const router = Router();

router.get('/', listCatalogItems);
router.get('/categories', getCatalogCategories);

// Stream 3D GLB model for furniture item
router.get('/:id/model-3d', streamObject3dModel);

router.get('/:id', getCatalogItemById);
router.get('/:id/asset', streamCatalogAsset);

// Super Admin Management Endpoints
router.post('/', authenticateToken, requireRole('SUPER_ADMIN'), createObjectCatalogItem);
router.patch('/:id', authenticateToken, requireRole('SUPER_ADMIN'), updateObjectCatalogItem);
router.delete('/:id', authenticateToken, requireRole('SUPER_ADMIN'), deleteObjectCatalogItem);
router.post(
  '/:id/model-3d',
  authenticateToken,
  requireRole('SUPER_ADMIN'),
  uploadCatalog3dGlb.single('file'),
  uploadObject3dModel
);

export default router;

