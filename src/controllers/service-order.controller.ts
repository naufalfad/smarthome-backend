/**
 * PHASE 7: COMMERCIAL SERVICE ORDER CONTROLLER
 *
 * Exposes customer order submission, order history, order cancellation,
 * and Super Admin order management with anti-caching headers and
 * multi-tenant authorization.
 */

import { Request, Response, NextFunction } from 'express';
import { serviceOrderService } from '../services/service-order.service.js';
import { ServiceOrderStatus, PropertyType } from '@prisma/client';
import { sendSuccess, sendError } from '../utils/response.js';

function setNoCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

// =========================================================================
// CUSTOMER HANDLERS
// =========================================================================

export async function submitCustomerOrder(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const userId = req.user!.userId;
    const customerProfileId = req.user!.customerProfileId;

    if (!customerProfileId) {
      return sendError(res, 'Akses ditolak: Profil pelanggan tidak ditemukan.', undefined, 403);
    }

    const {
      packageId,
      propertyName,
      propertyType,
      propertyAddress,
      city,
      postalCode,
      approximateAreaM2,
      estimatedRooms,
      customerNotes,
      contactName,
      contactPhone,
      houseId,
    } = req.body;

    const order = await serviceOrderService.submitOrder(userId, customerProfileId, {
      packageId,
      propertyName,
      propertyType: propertyType as PropertyType,
      propertyAddress,
      city,
      postalCode,
      approximateAreaM2,
      estimatedRooms: estimatedRooms ? Number(estimatedRooms) : undefined,
      customerNotes,
      contactName,
      contactPhone,
      houseId,
    });

    return sendSuccess(res, 'Pesanan layanan berhasil diajukan.', order, 201);
  } catch (err) {
    next(err);
  }
}

export async function listCustomerOrders(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const customerProfileId = req.user!.customerProfileId;

    if (!customerProfileId) {
      return sendError(res, 'Akses ditolak: Profil pelanggan tidak ditemukan.', undefined, 403);
    }

    const status = req.query.status as ServiceOrderStatus | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const result = await serviceOrderService.listCustomerOrders(customerProfileId, {
      status,
      search,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
      message: 'Daftar pesanan layanan berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const customerProfileId = req.user!.customerProfileId;
    const orderId = req.params.id as string;

    if (!customerProfileId) {
      return sendError(res, 'Akses ditolak: Profil pelanggan tidak ditemukan.', undefined, 403);
    }

    const order = await serviceOrderService.getCustomerOrderById(customerProfileId, orderId);
    return sendSuccess(res, 'Detail pesanan layanan berhasil diambil.', order);
  } catch (err) {
    next(err);
  }
}

export async function cancelCustomerOrder(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const userId = req.user!.userId;
    const customerProfileId = req.user!.customerProfileId;
    const orderId = req.params.id as string;

    if (!customerProfileId) {
      return sendError(res, 'Akses ditolak: Profil pelanggan tidak ditemukan.', undefined, 403);
    }

    const { cancellationReason } = req.body;
    const result = await serviceOrderService.cancelCustomerOrder(
      userId,
      customerProfileId,
      orderId,
      { cancellationReason }
    );

    return sendSuccess(res, 'Pesanan layanan berhasil dibatalkan.', result);
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// SUPER ADMIN HANDLERS
// =========================================================================

export async function listAdminOrders(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const status = req.query.status as ServiceOrderStatus | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const result = await serviceOrderService.listAdminOrders({
      status,
      search,
      page,
      limit,
    });

    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
      message: 'Daftar semua pesanan layanan berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminOrderById(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const orderId = req.params.id as string;
    const order = await serviceOrderService.getAdminOrderById(orderId);
    return sendSuccess(res, 'Detail pesanan layanan berhasil diambil.', order);
  } catch (err) {
    next(err);
  }
}

export async function confirmOrder(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const adminUserId = req.user!.userId;
    const orderId = req.params.id as string;
    const { adminNotes } = req.body;

    const result = await serviceOrderService.confirmOrder(adminUserId, orderId, {
      adminNotes,
    });

    return sendSuccess(res, 'Pesanan layanan berhasil dikonfirmasi.', result);
  } catch (err) {
    next(err);
  }
}

import { HandoverActivationService } from '../services/handover-activation.service.js';

export async function rejectOrder(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const adminUserId = req.user!.userId;
    const orderId = req.params.id as string;
    const { rejectionReason, adminNotes } = req.body;

    const result = await serviceOrderService.rejectOrder(adminUserId, orderId, {
      rejectionReason,
      adminNotes,
    });

    return sendSuccess(res, 'Pesanan layanan berhasil ditolak.', result);
  } catch (err) {
    next(err);
  }
}

export async function activateServiceOrderAndHouse(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    setNoCacheHeaders(res);
    const adminUserId = req.user!.userId;
    const orderId = req.params.id as string;
    const { adminNotes } = req.body;

    const result = await HandoverActivationService.activateOrderAndHouse(
      adminUserId,
      orderId,
      adminNotes
    );

    return sendSuccess(
      res,
      result.alreadyActive
        ? 'Properti sudah berstatus aktif (idempoten).'
        : 'Properti berhasil diaktivasi dan diserahterimakan ke pelanggan.',
      result,
      200
    );
  } catch (err) {
    next(err);
  }
}
