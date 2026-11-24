/**
 * PHASE 7: COMMERCIAL SERVICE ORDER ROUTES
 *
 * Defines Customer order submission & lifecycle routes and Super Admin
 * order management & decision routes.
 */

import { Router } from 'express';
import {
  submitCustomerOrder,
  listCustomerOrders,
  getCustomerOrderById,
  cancelCustomerOrder,
  listAdminOrders,
  getAdminOrderById,
  confirmOrder,
  rejectOrder,
  activateServiceOrderAndHouse,
} from '../controllers/service-order.controller.js';
import {
  listTechnicians,
  updateTechnicianAvailability,
  assignTechnicianToOrder,
  reassignOrderTechnician,
  getOrderAssignmentHistory,
} from '../controllers/service-order-assignment.controller.js';
import {
  getSurveyForAdmin,
  requestSurveyRevision,
  verifySurveyAndCreateHouse,
} from '../controllers/field-survey.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

export const serviceOrderRouter = Router();

// =========================================================================
// SUPER ADMIN ROUTES (/api/service-orders/admin/...)
// Strictly restricted to SUPER_ADMIN role
// =========================================================================
const adminRouter = Router();
adminRouter.use(requireRole('SUPER_ADMIN'));

adminRouter.get('/technicians', listTechnicians);
adminRouter.patch(
  '/technicians/:technicianProfileId/availability',
  validateUuidParam('technicianProfileId'),
  updateTechnicianAvailability
);

adminRouter.get('/all', listAdminOrders);
adminRouter.get('/', listAdminOrders);
adminRouter.get('/:id', validateUuidParam('id'), getAdminOrderById);
adminRouter.patch('/:id/confirm', validateUuidParam('id'), confirmOrder);
adminRouter.patch('/:id/reject', validateUuidParam('id'), rejectOrder);

// Phase 8: Dispatch & Assignment routes
adminRouter.post('/:id/assign', validateUuidParam('id'), assignTechnicianToOrder);
adminRouter.post('/:id/reassign', validateUuidParam('id'), reassignOrderTechnician);
adminRouter.get('/:id/assignments', validateUuidParam('id'), getOrderAssignmentHistory);

// Phase 9: Field Survey Review & Verification routes
adminRouter.get('/:id/survey', validateUuidParam('id'), getSurveyForAdmin);
adminRouter.post('/:id/survey/request-revision', validateUuidParam('id'), requestSurveyRevision);
adminRouter.post('/:id/survey/verify', validateUuidParam('id'), verifySurveyAndCreateHouse);

// Phase 11: Handover & Property Activation routes
adminRouter.post('/:id/activate', validateUuidParam('id'), activateServiceOrderAndHouse);

// Mount Admin sub-router under /admin
serviceOrderRouter.use('/admin', adminRouter);

// Phase 8, 9 & 11: Canonical top-level dispatch, survey & activation routes with strict SUPER_ADMIN role guard
serviceOrderRouter.post('/:id/assign', requireRole('SUPER_ADMIN'), validateUuidParam('id'), assignTechnicianToOrder);
serviceOrderRouter.post('/:id/reassign', requireRole('SUPER_ADMIN'), validateUuidParam('id'), reassignOrderTechnician);
serviceOrderRouter.get('/:id/assignments', requireRole('SUPER_ADMIN'), validateUuidParam('id'), getOrderAssignmentHistory);
serviceOrderRouter.get('/:id/survey', requireRole('SUPER_ADMIN'), validateUuidParam('id'), getSurveyForAdmin);
serviceOrderRouter.post('/:id/survey/request-revision', requireRole('SUPER_ADMIN'), validateUuidParam('id'), requestSurveyRevision);
serviceOrderRouter.post('/:id/survey/verify', requireRole('SUPER_ADMIN'), validateUuidParam('id'), verifySurveyAndCreateHouse);
serviceOrderRouter.post('/:id/activate', requireRole('SUPER_ADMIN'), validateUuidParam('id'), activateServiceOrderAndHouse);

// =========================================================================
// CUSTOMER ROUTES (/api/service-orders/...)
// Strictly restricted to CUSTOMER role
// =========================================================================
const customerRouter = Router();
customerRouter.use(requireRole('CUSTOMER'));

customerRouter.post('/', submitCustomerOrder);
customerRouter.get('/', listCustomerOrders);
customerRouter.get('/:id', validateUuidParam('id'), getCustomerOrderById);
customerRouter.patch('/:id/cancel', validateUuidParam('id'), cancelCustomerOrder);

// Mount Customer sub-router under root /
serviceOrderRouter.use('/', customerRouter);

export default serviceOrderRouter;
