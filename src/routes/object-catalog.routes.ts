import { Router } from 'express';
import {
  listCatalogItems,
  getCatalogCategories,
  getCatalogItemById,
  streamCatalogAsset,
} from '../controllers/object-catalog.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

router.get('/', listCatalogItems);
router.get('/categories', getCatalogCategories);
router.get('/:id', validateUuidParam('id'), getCatalogItemById);
router.get('/:id/asset', validateUuidParam('id'), streamCatalogAsset);

export default router;

