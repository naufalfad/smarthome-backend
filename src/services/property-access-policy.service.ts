/**
 * PHASE 4: CENTRALIZED BACKEND PROPERTY ACCESS POLICY SERVICE
 *
 * Implements strict multi-tenant authorization, IDOR protection,
 * state-gated setup status enforcement, and technician assignment hooks.
 */

import { prisma } from './db.service.js';
import { TokenPayload, AppUserRole } from '../utils/auth-crypto.util.js';
import { AppError } from '../middlewares/error.middleware.js';
import { AssignmentStatus, ServiceOrderStatus } from '@prisma/client';

export interface PropertyAccessOptions {
  /**
   * If true, CUSTOMER access is restricted strictly to properties with setupStatus === 'ACTIVE'.
   * Properties in setup (DRAFT, SURVEYING, CONFIGURING, TESTING, READY_FOR_HANDOVER, ARCHIVED)
   * are denied with HTTP 403 Forbidden.
   */
  requireActive?: boolean;
}

export interface AccessCheckResult {
  allowed: boolean;
  status: number;
  reason?: string;
  house?: any;
}

export class PropertyAccessPolicy {
  /**
   * Phase 8 Live Database-Backed Assignment Verification.
   * Evaluates whether the technician holds an ACTIVE ServiceOrderAssignment
   * for an eligible CONFIRMED ServiceOrder linked to this houseId.
   *
   * Zero reliance on in-memory ephemeral fallback. Immediate revocation on next request.
   */
  static async isTechnicianAssigned(
    technicianProfileId: string | null | undefined,
    houseId: string
  ): Promise<boolean> {
    if (!technicianProfileId || !houseId) {
      return false;
    }

    // Live Database-Backed Assignment Check (Phase 8 Production Authorization)
    const activeAssignment = await prisma.serviceOrderAssignment.findFirst({
      where: {
        technicianProfileId,
        status: AssignmentStatus.ACTIVE,
        serviceOrder: {
          houseId: houseId.trim(),
          status: ServiceOrderStatus.CONFIRMED,
        },
      },
      select: { id: true },
    });

    return !!activeAssignment;
  }

  /**
   * Evaluates whether the authenticated user has permission to access the specified property.
   * Returns a detailed result object without throwing.
   */
  static async canAccessProperty(
    user: TokenPayload | undefined,
    houseId: string,
    options?: PropertyAccessOptions
  ): Promise<AccessCheckResult> {
    if (!user || !user.role) {
      return {
        allowed: false,
        status: 401,
        reason: 'Akses ditolak: Autentikasi diperlukan.',
      };
    }

    if (!houseId || typeof houseId !== 'string' || !houseId.trim()) {
      return {
        allowed: false,
        status: 400,
        reason: "Parameter 'houseId' wajib disertakan.",
      };
    }

    const house = await prisma.house.findUnique({
      where: { id: houseId.trim() },
      select: {
        id: true,
        name: true,
        customerId: true,
        setupStatus: true,
        publishStatus: true,
        hasPhysicalIot: true,
        propertyType: true,
        address: true,
      },
    });

    if (!house) {
      return {
        allowed: false,
        status: 404,
        reason: 'Properti tidak ditemukan.',
      };
    }

    // 1. SUPER_ADMIN: Unrestricted access to all properties regardless of status or owner
    if (user.role === 'SUPER_ADMIN') {
      return { allowed: true, status: 200, house };
    }

    // 2. CUSTOMER: Multi-tenant ownership and state-gated access
    if (user.role === 'CUSTOMER') {
      if (!user.customerProfileId) {
        return {
          allowed: false,
          status: 403,
          reason: 'Akses dilarang: Akun Anda tidak memiliki profil pelanggan aktif.',
        };
      }

      // Strict ownership check (IDOR Protection)
      if (!house.customerId || house.customerId !== user.customerProfileId) {
        return {
          allowed: false,
          status: 403,
          reason: 'Akses dilarang: Anda tidak memiliki hak akses ke properti ini.',
        };
      }

      // State-gated access: non-ACTIVE properties cannot be accessed for operational features
      if (options?.requireActive && house.setupStatus !== 'ACTIVE') {
        return {
          allowed: false,
          status: 403,
          reason: `Akses dilarang: Properti belum berstatus ACTIVE (status saat ini: ${house.setupStatus}). Data operasional hanya dapat diakses setelah serah terima selesai.`,
        };
      }

      return { allowed: true, status: 200, house };
    }

    // 3. TECHNICIAN: Assignment-gated access
    if (user.role === 'TECHNICIAN') {
      const isAssigned = await this.isTechnicianAssigned(user.technicianProfileId, house.id);
      if (!isAssigned) {
        return {
          allowed: false,
          status: 403,
          reason: 'Akses dilarang: Teknisi belum memiliki penugasan aktif pada properti ini.',
        };
      }
      return { allowed: true, status: 200, house };
    }

    return {
      allowed: false,
      status: 403,
      reason: 'Akses dilarang: Peran pengguna tidak dikenali.',
    };
  }

  /**
   * Asserts that the authenticated user can access the specified property.
   * Throws an AppError with appropriate HTTP status if denied.
   */
  static async assertCanAccessProperty(
    user: TokenPayload | undefined,
    houseId: string,
    options?: PropertyAccessOptions
  ): Promise<any> {
    const check = await this.canAccessProperty(user, houseId, options);
    if (!check.allowed) {
      throw new AppError(check.reason || 'Akses ditolak.', check.status);
    }
    return check.house;
  }

  /**
   * Asserts that a Customer owns the specified property (regardless of active status).
   * Useful for property summary/milestone queries during setup.
   */
  static async assertCustomerOwnsProperty(
    user: TokenPayload | undefined,
    houseId: string
  ): Promise<any> {
    return this.assertCanAccessProperty(user, houseId, { requireActive: false });
  }

  /**
   * Asserts that the property is ACTIVE if the accessing user is a Customer.
   */
  static assertPropertyActiveForCustomer(user: TokenPayload | undefined, house: any): void {
    if (user?.role === 'CUSTOMER' && house.setupStatus !== 'ACTIVE') {
      throw new AppError(
        `Akses dilarang: Properti belum berstatus ACTIVE (status saat ini: ${house.setupStatus}).`,
        403
      );
    }
  }

  /**
   * Asserts access to a Floor entity and its parent House.
   */
  static async assertCanAccessFloor(
    user: TokenPayload | undefined,
    floorId: string,
    options?: PropertyAccessOptions
  ): Promise<{ floor: any; house: any }> {
    if (!floorId || typeof floorId !== 'string') {
      throw new AppError("Parameter 'floorId' wajib disertakan.", 400);
    }

    const floor = await prisma.floor.findUnique({
      where: { id: floorId.trim() },
      select: { id: true, name: true, levelNumber: true, houseId: true },
    });

    if (!floor) {
      throw new AppError(`Lantai dengan ID '${floorId}' tidak ditemukan.`, 404);
    }

    const house = await this.assertCanAccessProperty(user, floor.houseId, options);
    return { floor, house };
  }

  /**
   * Asserts access to a FloorPlan entity and its parent House.
   */
  static async assertCanAccessFloorPlan(
    user: TokenPayload | undefined,
    floorPlanId: string,
    options?: PropertyAccessOptions
  ): Promise<{ floorPlan: any; floor: any; house: any }> {
    if (!floorPlanId || typeof floorPlanId !== 'string') {
      throw new AppError("Parameter 'floorPlanId' wajib disertakan.", 400);
    }

    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId.trim() },
      select: {
        id: true,
        floorId: true,
        floor: {
          select: { id: true, name: true, houseId: true },
        },
      },
    });

    if (!floorPlan || !floorPlan.floor) {
      throw new AppError(`Denah lantai dengan ID '${floorPlanId}' tidak ditemukan.`, 404);
    }

    const house = await this.assertCanAccessProperty(user, floorPlan.floor.houseId, options);
    return { floorPlan, floor: floorPlan.floor, house };
  }

  /**
   * Asserts that the authenticated user can edit a FloorPlan entity (Phase 10 CAD Modeling).
   * Allows SUPER_ADMIN and assigned TECHNICIAN.
   * Rejects CUSTOMER and unassigned TECHNICIAN with HTTP 403 Forbidden.
   */
  static async assertCanEditFloorPlan(
    user: TokenPayload | undefined,
    floorPlanId: string
  ): Promise<{ floorPlan: any; floor: any; house: any }> {
    if (!floorPlanId || typeof floorPlanId !== 'string') {
      throw new AppError("Parameter 'floorPlanId' wajib disertakan.", 400);
    }
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }
    if (user.role === 'CUSTOMER') {
      throw new AppError('Akses dilarang: Pelanggan tidak memiliki izin untuk memodifikasi denah lantai.', 403);
    }
    return this.assertCanAccessFloorPlan(user, floorPlanId, { requireActive: false });
  }

  /**
   * Asserts that the authenticated user can edit a Floor entity (Phase 10 CAD Modeling).
   * Allows SUPER_ADMIN and assigned TECHNICIAN.
   * Rejects CUSTOMER and unassigned TECHNICIAN with HTTP 403 Forbidden.
   */
  static async assertCanEditFloor(
    user: TokenPayload | undefined,
    floorId: string
  ): Promise<{ floor: any; house: any }> {
    if (!floorId || typeof floorId !== 'string') {
      throw new AppError("Parameter 'floorId' wajib disertakan.", 400);
    }
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }
    if (user.role === 'CUSTOMER') {
      throw new AppError('Akses dilarang: Pelanggan tidak memiliki izin untuk memodifikasi lantai properti.', 403);
    }
    return this.assertCanAccessFloor(user, floorId, { requireActive: false });
  }

  /**
   * Asserts that the authenticated user can edit a Room entity (Phase 10 CAD Modeling).
   * Allows SUPER_ADMIN and assigned TECHNICIAN.
   * Rejects CUSTOMER and unassigned TECHNICIAN with HTTP 403 Forbidden.
   */
  static async assertCanEditRoom(
    user: TokenPayload | undefined,
    roomId: string
  ): Promise<{ room: any; floor: any; house: any }> {
    if (!roomId || typeof roomId !== 'string') {
      throw new AppError("Parameter 'roomId' wajib disertakan.", 400);
    }
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }
    if (user.role === 'CUSTOMER') {
      throw new AppError('Akses dilarang: Pelanggan tidak memiliki izin untuk memodifikasi ruangan properti.', 403);
    }
    return this.assertCanAccessRoom(user, roomId, { requireActive: false });
  }

  /**
   * Asserts access to a Room entity and its parent House.
   */
  static async assertCanAccessRoom(
    user: TokenPayload | undefined,
    roomId: string,
    options?: PropertyAccessOptions
  ): Promise<{ room: any; floor: any; house: any }> {
    if (!roomId || typeof roomId !== 'string') {
      throw new AppError("Parameter 'roomId' wajib disertakan.", 400);
    }

    const room = await prisma.room.findUnique({
      where: { id: roomId.trim() },
      select: {
        id: true,
        name: true,
        floorId: true,
        floorRel: {
          select: { id: true, name: true, houseId: true },
        },
      },
    });

    if (!room || !room.floorRel) {
      throw new AppError(`Ruangan dengan ID '${roomId}' tidak ditemukan.`, 404);
    }

    const house = await this.assertCanAccessProperty(user, room.floorRel.houseId, options);
    return { room, floor: room.floorRel, house };
  }

  /**
   * Asserts access to a Device entity and its parent House.
   */
  static async assertCanAccessDevice(
    user: TokenPayload | undefined,
    deviceId: string,
    options?: PropertyAccessOptions
  ): Promise<{ device: any; house: any }> {
    if (!deviceId || typeof deviceId !== 'string') {
      throw new AppError("Parameter 'deviceId' wajib disertakan.", 400);
    }

    const device = await prisma.device.findUnique({
      where: { id: deviceId.trim() },
      select: {
        id: true,
        name: true,
        type: true,
        houseId: true,
        floorId: true,
        floorPlanId: true,
        roomId: true,
      },
    });

    if (!device) {
      throw new AppError(`Perangkat dengan ID '${deviceId}' tidak ditemukan.`, 404);
    }

    if (!device.houseId) {
      // Device unassigned to any house can only be managed by SUPER_ADMIN
      if (user?.role !== 'SUPER_ADMIN') {
        throw new AppError('Akses dilarang: Perangkat tidak terhubung ke properti yang valid.', 403);
      }
      return { device, house: null };
    }

    const house = await this.assertCanAccessProperty(user, device.houseId, options);
    return { device, house };
  }

  /**
   * Asserts that the authenticated user can edit or delete a Device entity on a FloorPlan.
   * Allows SUPER_ADMIN and assigned TECHNICIAN.
   * Rejects CUSTOMER and unassigned TECHNICIAN with HTTP 403 Forbidden.
   */
  static async assertCanEditDevice(
    user: TokenPayload | undefined,
    deviceId: string
  ): Promise<{ device: any; house: any }> {
    if (!deviceId || typeof deviceId !== 'string') {
      throw new AppError("Parameter 'deviceId' wajib disertakan.", 400);
    }
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }
    if (user.role === 'CUSTOMER') {
      throw new AppError('Akses dilarang: Pelanggan tidak memiliki izin untuk memodifikasi perangkat denah.', 403);
    }
    return this.assertCanAccessDevice(user, deviceId, { requireActive: false });
  }

  /**
   * Asserts access to an AutomationRule entity and its parent House.
   */
  static async assertCanAccessAutomationRule(
    user: TokenPayload | undefined,
    ruleId: string,
    options?: PropertyAccessOptions
  ): Promise<{ rule: any; house: any }> {
    if (!ruleId || typeof ruleId !== 'string') {
      throw new AppError("Parameter 'ruleId' wajib disertakan.", 400);
    }

    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId.trim() },
      select: {
        id: true,
        name: true,
        houseId: true,
        enabled: true,
        priority: true,
      },
    });

    if (!rule) {
      throw new AppError(`Aturan otomasi dengan ID '${ruleId}' tidak ditemukan.`, 404);
    }

    if (!rule.houseId) {
      // Rule without houseId can only be accessed by SUPER_ADMIN
      if (user?.role !== 'SUPER_ADMIN') {
        throw new AppError('Akses dilarang: Aturan otomasi tidak terhubung ke properti yang valid.', 403);
      }
      return { rule, house: null };
    }

    const house = await this.assertCanAccessProperty(user, rule.houseId, options);
    return { rule, house };
  }

  /**
   * Enforces internal company survey protection:
   * Strictly denies CUSTOMER access (Decision 3).
   */
  static async assertCanAccessInternalSurvey(
    user: TokenPayload | undefined,
    houseId?: string
  ): Promise<void> {
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    if (user.role === 'CUSTOMER') {
      throw new AppError(
        'Akses dilarang: Dokumentasi dan survei teknisi bersifat internal perusahaan.',
        403
      );
    }

    if (user.role === 'TECHNICIAN') {
      if (houseId) {
        const isAssigned = await this.isTechnicianAssigned(user.technicianProfileId, houseId);
        if (!isAssigned) {
          throw new AppError(
            'Akses dilarang: Teknisi belum memiliki penugasan aktif pada properti ini.',
            403
          );
        }
      }
    }
  }

  /**
   * Evaluates whether a technician holds an ACTIVE assignment on a specific ServiceOrder.
   * Directly queries the live database (Phase 9 Pre-House Authorization).
   */
  static async isTechnicianAssignedToOrder(
    technicianProfileId: string | null | undefined,
    serviceOrderId: string
  ): Promise<boolean> {
    if (!technicianProfileId || !serviceOrderId) {
      return false;
    }

    const activeAssignment = await prisma.serviceOrderAssignment.findFirst({
      where: {
        technicianProfileId,
        serviceOrderId: serviceOrderId.trim(),
        status: AssignmentStatus.ACTIVE,
      },
      select: { id: true },
    });

    return !!activeAssignment;
  }

  /**
   * Asserts whether a user can access survey data/assets for a specific ServiceOrder (Phase 9).
   * - SUPER_ADMIN: Allowed globally.
   * - CUSTOMER: Strictly denied 403 Forbidden (internal company operational data).
   * - TECHNICIAN: Allowed if and only if holds an ACTIVE assignment on this order.
   */
  static async assertCanAccessOrderSurvey(
    user: TokenPayload | undefined,
    serviceOrderId: string
  ): Promise<void> {
    if (!user || !user.role) {
      throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
    }

    if (user.role === 'SUPER_ADMIN') {
      return;
    }

    if (user.role === 'CUSTOMER') {
      throw new AppError(
        'Akses dilarang: Dokumentasi dan survei teknisi bersifat internal perusahaan.',
        403
      );
    }

    if (user.role === 'TECHNICIAN') {
      const isAssigned = await this.isTechnicianAssignedToOrder(
        user.technicianProfileId,
        serviceOrderId
      );
      if (!isAssigned) {
        throw new AppError(
          'Akses dilarang: Teknisi belum memiliki penugasan aktif pada pesanan ini.',
          403
        );
      }
      return;
    }

    throw new AppError('Akses dilarang: Peran pengguna tidak dikenali.', 403);
  }

  /**
   * Verifies that a resource belongs to the expected house (prevents cross-property resource injection).
   */
  static assertResourceBelongsToHouse(
    resourceHouseId: string | null | undefined,
    expectedHouseId: string,
    resourceDescription: string
  ): void {
    if (!resourceHouseId || resourceHouseId !== expectedHouseId) {
      throw new AppError(
        `Injeksi sumber daya ditolak: ${resourceDescription} tidak terdaftar pada properti '${expectedHouseId}'.`,
        400
      );
    }
  }
}

