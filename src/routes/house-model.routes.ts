import { Router } from 'express';
import {
  getHouseModels,
  getHouseModelById,
  createHouseModel,
  updateHouseModel,
  deleteHouseModel,
  getModelInspection,
  inspectHouseModel,
  streamModelFile,
  streamModelThumbnail,
} from '../controllers/house-model.controller.js';
import { uploadModelFile } from '../middlewares/upload.middleware.js';
import { commandAndUploadLimiter } from '../middlewares/rate-limiter.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import identificationRoutes from './node-identification.routes.js';

const router = Router();

// Sub-resource: Node Identifications (Phase 4)
router.use('/:id/identifications', validateUuidParam('id'), identificationRoutes);

// List house models (GET /api/house-models)
router.get('/', getHouseModels);

// Upload new GLB house model (POST /api/house-models) - Super Admin only
router.post('/', requireRole('SUPER_ADMIN'), commandAndUploadLimiter, uploadModelFile.single('file'), createHouseModel);

// Get single house model details (GET /api/house-models/:id)
router.get('/:id', validateUuidParam('id'), getHouseModelById);

// Update model information (PATCH /api/house-models/:id) - Super Admin only
router.patch('/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN'), updateHouseModel);

// Delete model and storage file (DELETE /api/house-models/:id) - Super Admin only
router.delete('/:id', validateUuidParam('id'), requireRole('SUPER_ADMIN'), deleteHouseModel);

// Retrieve model GLB inspection manifest (GET /api/house-models/:id/inspection)
router.get('/:id/inspection', validateUuidParam('id'), getModelInspection);

// Trigger re-inspection of model file (POST /api/house-models/:id/inspect) - Super Admin only
router.post('/:id/inspect', validateUuidParam('id'), requireRole('SUPER_ADMIN'), inspectHouseModel);

// Secure stream of the 3D GLB file (GET /api/house-models/:id/file)
router.get('/:id/file', validateUuidParam('id'), streamModelFile);

// Secure stream of model thumbnail image (GET /api/house-models/:id/thumbnail)
router.get('/:id/thumbnail', validateUuidParam('id'), streamModelThumbnail);

export default router;

