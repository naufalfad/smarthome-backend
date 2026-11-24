/**
 * PHASE 11: HANDOVER & PROPERTY ACTIVATION SERVICE
 *
 * Implements transaction-safe, idempotent handover and canonical property activation.
 * - Row-level locking on ServiceOrder and House.
 * - Precondition validations: >= 1 device installed, eligible status.
 * - Atomic transitions: House.setupStatus -> ACTIVE, ServiceOrderAssignment -> COMPLETED.
 * - Idempotency: Repeated activation returns HTTP 200 without side effects.
 * - ServiceOrderStatusHistory audit logging.
 */

import { AssignmentStatus, ServiceOrderStatus, PropertySetupStatus } from '@prisma/client';
import { prisma } from './db.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export interface ActivationResult {
  alreadyActive: boolean;
  orderId: string;
  orderNumber: string;
  houseId: string;
  houseName: string;
  customerId: string;
  setupStatus: PropertySetupStatus;
  deviceCount: number;
  completedAssignmentsCount: number;
}

export class HandoverActivationService {
  /**
   * Super Admin activates an order and its canonical house.
   * Executes atomic database transaction with row-level locks (SELECT ... FOR UPDATE).
   */
  static async activateOrderAndHouse(
    adminUserId: string,
    orderId: string,
    adminNotes?: string
  ): Promise<ActivationResult> {
    if (!orderId || typeof orderId !== 'string') {
      throw new AppError("Parameter 'orderId' wajib disertakan.", 400);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock ServiceOrder row for update
      const orderRows = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          orderNumber: string;
          houseId: string | null;
          customerId: string;
        }>
      >`
        SELECT id, status, "orderNumber", "houseId", "customerId"
        FROM service_orders
        WHERE id = ${orderId}
        FOR UPDATE
      `;

      if (!orderRows || orderRows.length === 0) {
        throw new AppError('Pesanan layanan tidak ditemukan.', 404);
      }

      const order = orderRows[0];

      // 2. Validate Order is CONFIRMED
      if (order.status !== ServiceOrderStatus.CONFIRMED) {
        throw new AppError(
          `Aktivasi ditolak: Hanya pesanan dengan status CONFIRMED yang dapat diaktivasi (status saat ini: ${order.status}).`,
          409
        );
      }

      // 3. Validate linked House
      if (!order.houseId) {
        throw new AppError(
          'Aktivasi ditolak: Pesanan belum memiliki properti terkait. Survei lapangan harus diverifikasi terlebih dahulu.',
          400
        );
      }

      // 4. Lock House row for update
      const houseRows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          setupStatus: PropertySetupStatus;
          customerId: string | null;
        }>
      >`
        SELECT id, name, "setupStatus", "customerId"
        FROM houses
        WHERE id = ${order.houseId}
        FOR UPDATE
      `;

      if (!houseRows || houseRows.length === 0) {
        throw new AppError('Properti terkait tidak ditemukan.', 404);
      }

      const house = houseRows[0];

      // 5. IDEMPOTENCY CHECK: If already ACTIVE, return cleanly
      if (house.setupStatus === PropertySetupStatus.ACTIVE) {
        const devCount = await tx.device.count({ where: { houseId: house.id } });
        return {
          alreadyActive: true,
          orderId: order.id,
          orderNumber: order.orderNumber,
          houseId: house.id,
          houseName: house.name,
          customerId: order.customerId,
          setupStatus: PropertySetupStatus.ACTIVE,
          deviceCount: devCount,
          completedAssignmentsCount: 0,
        };
      }

      // 6. Precondition: Check device count (minimum 1 device installed)
      const deviceCount = await tx.device.count({
        where: { houseId: house.id },
      });

      if (deviceCount === 0) {
        throw new AppError(
          'Aktivasi ditolak: Minimal 1 perangkat IoT harus terpasang pada properti sebelum serah terima.',
          400
        );
      }

      // 7. Precondition: House status must be eligible for handover
      const eligibleStatuses: PropertySetupStatus[] = [
        PropertySetupStatus.CONFIGURING,
        PropertySetupStatus.READY_FOR_HANDOVER,
        PropertySetupStatus.TESTING,
      ];

      if (!eligibleStatuses.includes(house.setupStatus)) {
        throw new AppError(
          `Aktivasi ditolak: Status properti tidak valid untuk serah terima (status saat ini: ${house.setupStatus}).`,
          409
        );
      }

      // 8. Atomic Transition: House setupStatus -> ACTIVE
      await tx.house.update({
        where: { id: house.id },
        data: {
          setupStatus: PropertySetupStatus.ACTIVE,
          publishStatus: 'PUBLISHED',
          publishedAt: new Date(),
        },
      });

      // 9. Atomic Transition: Active assignments -> COMPLETED
      const activeAssignments = await tx.serviceOrderAssignment.findMany({
        where: {
          serviceOrderId: order.id,
          status: AssignmentStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (activeAssignments.length > 0) {
        await tx.serviceOrderAssignment.updateMany({
          where: {
            serviceOrderId: order.id,
            status: AssignmentStatus.ACTIVE,
          },
          data: {
            status: AssignmentStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }

      // 10. Audit Trail: Append to ServiceOrderStatusHistory
      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: order.id,
          previousStatus: order.status as ServiceOrderStatus,
          newStatus: order.status as ServiceOrderStatus,
          actorUserId: adminUserId,
          actorRole: 'SUPER_ADMIN',
          reason: 'Aktivasi dan Serah Terima Properti (Handover Completed)',
          notes:
            adminNotes?.trim() ||
            `Properti '${house.name}' (${deviceCount} perangkat) berhasil diserahterimakan dan diaktifkan untuk operasional pelanggan.`,
        },
      });

      return {
        alreadyActive: false,
        orderId: order.id,
        orderNumber: order.orderNumber,
        houseId: house.id,
        houseName: house.name,
        customerId: order.customerId,
        setupStatus: PropertySetupStatus.ACTIVE,
        deviceCount,
        completedAssignmentsCount: activeAssignments.length,
      };
    });
  }
}
