/**
 * PHASE 8: SERVICE ORDER ASSIGNMENT CONTROLLER
 *
 * Exposes Super Admin dispatch endpoints and Technician self-scoped workspace endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { ServiceOrderAssignmentService } from '../services/service-order-assignment.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Super Admin: List all technicians with availability status and workload count.
 * GET /api/service-orders/admin/technicians
 */
export async function listTechnicians(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const technicians = await ServiceOrderAssignmentService.listTechniciansForDispatch();
    sendSuccess(res, 'Daftar teknisi berhasil dimuat.', technicians);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Update technician availability status.
 * PATCH /api/service-orders/admin/technicians/:technicianProfileId/availability
 */
export async function updateTechnicianAvailability(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { technicianProfileId } = req.params;
    const { availabilityStatus } = req.body;

    if (!availabilityStatus) {
      throw new AppError('Parameter availabilityStatus wajib disertakan.', 400);
    }

    const updated = await ServiceOrderAssignmentService.updateTechnicianAvailability(
      technicianProfileId as string,
      availabilityStatus
    );
    sendSuccess(res, 'Status ketersediaan teknisi berhasil diperbarui.', updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Assign primary technician to confirmed order.
 * POST /api/service-orders/admin/:id/assign
 */
export async function assignTechnicianToOrder(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const serviceOrderId = req.params.id as string;
    const adminUserId = req.user!.userId;
    const { technicianProfileId, technicianInstructions } = req.body;

    const result = await ServiceOrderAssignmentService.assignTechnician(
      serviceOrderId,
      { technicianProfileId, technicianInstructions },
      adminUserId
    );

    sendSuccess(res, 'Teknisi berhasil ditugaskan pada pesanan.', result, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Reassign order to a new technician.
 * POST /api/service-orders/admin/:id/reassign
 */
export async function reassignOrderTechnician(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const serviceOrderId = req.params.id as string;
    const adminUserId = req.user!.userId;
    const { technicianProfileId, reason, technicianInstructions, currentAssignmentId } = req.body;

    const result = await ServiceOrderAssignmentService.reassignTechnician(
      serviceOrderId,
      { technicianProfileId, reason, technicianInstructions, currentAssignmentId },
      adminUserId
    );

    sendSuccess(res, 'Penugasan teknisi berhasil dialihkan.', result, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Get assignment and reassignment audit history for an order.
 * GET /api/service-orders/admin/:id/assignments
 */
export async function getOrderAssignmentHistory(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const serviceOrderId = req.params.id as string;
    const history = await ServiceOrderAssignmentService.getOrderAssignmentHistory(serviceOrderId);
    sendSuccess(res, 'Riwayat penugasan berhasil diambil.', history);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Get own ACTIVE assigned orders.
 * GET /api/technician/assignments
 */
export async function getMyAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Akun Anda tidak memiliki profil teknisi aktif.', 403);
    }

    const assignments = await ServiceOrderAssignmentService.getTechnicianActiveAssignments(
      technicianProfileId
    );
    sendSuccess(res, 'Daftar penugasan aktif berhasil dimuat.', assignments);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Get detail of an active assigned order.
 * GET /api/technician/assignments/:assignmentId
 */
export async function getMyAssignmentDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Akun Anda tidak memiliki profil teknisi aktif.', 403);
    }

    const assignmentId = req.params.assignmentId as string;
    const assignment = await ServiceOrderAssignmentService.getTechnicianAssignmentDetail(
      assignmentId,
      technicianProfileId
    );
    sendSuccess(res, 'Detail penugasan kerja berhasil diambil.', assignment);
  } catch (err) {
    next(err);
  }
}
