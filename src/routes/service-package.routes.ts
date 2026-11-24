/**
 * PHASE 6: COMMERCIAL SERVICE PACKAGE ROUTES
 *
 * Defines Super Admin management routes and Customer catalog routes.
 */

import { Router } from 'express';
import {
  listAdminPackages,
  getAdminPackageById,
  createPackage,
  updatePackage,
  activatePackage,
  deactivatePackage,
  archivePackage,
  deletePackage,
  listCatalogPackages,
  getCatalogPackageById,
} from '../controllers/service-package.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

// 1. Super Admin Management Router (/api/service-packages)
export const adminServicePackageRouter = Router();

// Strictly locked to SUPER_ADMIN role only
adminServicePackageRouter.use(requireRole('SUPER_ADMIN'));

adminServicePackageRouter.get('/', listAdminPackages);
adminServicePackageRouter.post('/', createPackage);
adminServicePackageRouter.get('/:id', validateUuidParam('id'), getAdminPackageById);
adminServicePackageRouter.put('/:id', validateUuidParam('id'), updatePackage);
adminServicePackageRouter.patch('/:id/activate', validateUuidParam('id'), activatePackage);
adminServicePackageRouter.patch('/:id/deactivate', validateUuidParam('id'), deactivatePackage);
adminServicePackageRouter.patch('/:id/archive', validateUuidParam('id'), archivePackage);
adminServicePackageRouter.delete('/:id', validateUuidParam('id'), deletePackage);

// 2. Customer Catalog Router (/api/catalog/packages)
export const customerCatalogRouter = Router();

// Strictly locked to CUSTOMER role only (Super Admin uses /api/service-packages; Technician is denied)
customerCatalogRouter.use(requireRole('CUSTOMER'));

customerCatalogRouter.get('/', listCatalogPackages);
customerCatalogRouter.get('/:id', getCatalogPackageById);
