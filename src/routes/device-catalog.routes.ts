import { Router } from 'express';
import {
  listDeviceCatalog,
  getDeviceCatalogById,
  getDeviceCatalogByType,
  getDeviceCapabilities,
} from '../controllers/device-catalog.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

// GET /api/device-catalog
router.get('/', listDeviceCatalog);

// GET /api/device-catalog/by-type/:deviceType
router.get('/by-type/:deviceType', getDeviceCatalogByType);

// GET /api/device-catalog/by-type/:deviceType/capabilities
router.get('/by-type/:deviceType/capabilities', getDeviceCapabilities);

// GET /api/device-catalog/:id
router.get('/:id', validateUuidParam('id'), getDeviceCatalogById);

export default router;

