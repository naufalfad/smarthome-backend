/**
 * PHASE 7: COMMERCIAL SERVICE ORDER SERVICE
 *
 * Implements customer service order submission from active catalog packages,
 * immutable package snapshotting, concurrency-safe lifecycle transitions (PENDING,
 * CONFIRMED, REJECTED, CANCELLED), append-only status audit tracking, sequence-based
 * order numbering (SO-YYYY-XXXXXX), and Super Admin review operations.
 */

import { Prisma, ServiceOrderStatus, PropertyType, AssignmentStatus } from '@prisma/client';
import { prisma } from './db.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export interface SubmitServiceOrderInput {
  packageId: string;
  propertyName: string;
  propertyType?: PropertyType;
  propertyAddress: string;
  city?: string | null;
  postalCode?: string | null;
  approximateAreaM2?: number | string | null;
  estimatedRooms?: number | null;
  customerNotes?: string | null;
  contactName: string;
  contactPhone: string;
  houseId?: string | null;
}

export interface ListOrdersFilter {
  status?: ServiceOrderStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CancelOrderInput {
  cancellationReason?: string;
}

export interface AdminConfirmOrderInput {
  adminNotes?: string;
}

export interface AdminRejectOrderInput {
  rejectionReason: string;
  adminNotes?: string;
}

export class ServiceOrderService {
  /**
   * Generates a unique monotonic order number using the PostgreSQL native sequence.
   * Format: SO-YYYY-XXXXXX (e.g. SO-2026-000001)
   */
  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const seqResult = await tx.$queryRaw<{ seq: bigint | number | string }[]>`
      SELECT nextval('service_order_number_seq') AS seq
    `;
    const seqVal = Number(seqResult[0]?.seq || 1);
    const year = new Date().getFullYear();
    const padded = String(seqVal).padStart(6, '0');
    return `SO-${year}-${padded}`;
  }

  /**
   * Submits a new Service Order for a Customer.
   * Atomically snapshots the active catalog package, verifies property/customer integrity,
   * creates the order in PENDING status, and records the initial status history.
   */
  async submitOrder(
    customerUserId: string,
    customerProfileId: string,
    input: SubmitServiceOrderInput
  ) {
    if (!customerProfileId) {
      throw new AppError('Profil pelanggan tidak ditemukan untuk akun ini.', 400);
    }

    if (!input.packageId || typeof input.packageId !== 'string') {
      throw new AppError('ID Paket layanan wajib diisi.', 400);
    }

    if (!input.contactName || input.contactName.trim().length < 2) {
      throw new AppError('Nama kontak pemesan wajib diisi (minimal 2 karakter).', 400);
    }

    if (!input.contactPhone || input.contactPhone.trim().length < 8) {
      throw new AppError('Nomor telepon kontak pemesan wajib diisi (minimal 8 karakter).', 400);
    }

    if (!input.propertyName || input.propertyName.trim().length < 2) {
      throw new AppError('Nama properti wajib diisi (minimal 2 karakter).', 400);
    }

    if (!input.propertyAddress || input.propertyAddress.trim().length < 5) {
      throw new AppError('Alamat lengkap properti wajib diisi (minimal 5 karakter).', 400);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch package with row-level lock (FOR SHARE) to prevent concurrent deactivation/updates
      const [lockedPkg] = await tx.$queryRaw<
        {
          id: string;
          name: string;
          code: string;
          price: Prisma.Decimal;
          currency: string;
          status: string;
          shortDescription: string;
          description: string;
          estimatedDuration: string | null;
          maxRooms: number | null;
          maxDevices: number | null;
          includedAutomations: number | null;
          hasPhysicalIot: boolean;
          hasThreeD: boolean;
        }[]
      >`
        SELECT id, name, code, price, currency, status, "shortDescription", description,
               "estimatedDuration", "maxRooms", "maxDevices", "includedAutomations",
               "hasPhysicalIot", "hasThreeD"
        FROM service_packages
        WHERE id = ${input.packageId}
        FOR SHARE
      `;

      if (!lockedPkg || lockedPkg.status !== 'ACTIVE') {
        throw new AppError(
          'Paket layanan yang dipilih tidak ditemukan atau sedang tidak aktif.',
          400
        );
      }

      // Fetch inclusions for locked package
      const inclusions = await tx.servicePackageInclusion.findMany({
        where: { packageId: lockedPkg.id },
        orderBy: { displayOrder: 'asc' },
      });

      // 2. If linking to an existing property (houseId), ensure it belongs to this customer
      if (input.houseId) {
        const existingHouse = await tx.house.findFirst({
          where: {
            id: input.houseId,
            customerId: customerProfileId,
          },
        });
        if (!existingHouse) {
          throw new AppError(
            'Properti yang dipilih tidak valid atau tidak terkait dengan akun Anda.',
            400
          );
        }
      }

      // 3. Generate unique monotonic order number
      const orderNumber = await this.generateOrderNumber(tx);

      // 4. Build immutable package snapshot directly from database record
      const packageSnapshot = {
        packageId: lockedPkg.id,
        packageName: lockedPkg.name,
        packageCode: lockedPkg.code,
        price: lockedPkg.price.toString(),
        currency: lockedPkg.currency,
        shortDescription: lockedPkg.shortDescription,
        description: lockedPkg.description,
        estimatedDuration: lockedPkg.estimatedDuration,
        maxRooms: lockedPkg.maxRooms,
        maxDevices: lockedPkg.maxDevices,
        includedAutomations: lockedPkg.includedAutomations,
        hasPhysicalIot: lockedPkg.hasPhysicalIot,
        hasThreeD: lockedPkg.hasThreeD,
        inclusions: inclusions.map((inc) => ({
          id: inc.id,
          category: inc.category,
          displayName: inc.displayName,
          description: inc.description,
          isIncluded: inc.isIncluded,
          quantity: inc.quantity,
          displayOrder: inc.displayOrder,
        })),
        capturedAt: new Date().toISOString(),
      };

      // 5. Handle approximateAreaM2 Decimal conversion safely
      let approximateAreaM2: Prisma.Decimal | null = null;
      if (
        input.approximateAreaM2 !== undefined &&
        input.approximateAreaM2 !== null &&
        input.approximateAreaM2 !== ''
      ) {
        const numVal = Number(input.approximateAreaM2);
        if (isNaN(numVal) || numVal < 0) {
          throw new AppError('Luas bangunan harus berupa angka positif yang valid.', 400);
        }
        approximateAreaM2 = new Prisma.Decimal(numVal.toFixed(2));
      }

      // 6. Insert ServiceOrder with immutable contact snapshot (no mutation of CustomerProfile)
      const createdOrder = await tx.serviceOrder.create({
        data: {
          orderNumber,
          customerId: customerProfileId,
          servicePackageId: lockedPkg.id,
          packageSnapshot,
          packageName: lockedPkg.name,
          packageCode: lockedPkg.code,
          packagePrice: lockedPkg.price,
          currency: lockedPkg.currency,
          contactName: input.contactName.trim(),
          contactPhone: input.contactPhone.trim(),
          propertyName: input.propertyName.trim(),
          propertyType: input.propertyType || PropertyType.HOUSE,
          propertyAddress: input.propertyAddress.trim(),
          city: input.city ? input.city.trim() : null,
          postalCode: input.postalCode ? input.postalCode.trim() : null,
          approximateAreaM2,
          estimatedRooms: input.estimatedRooms ? Number(input.estimatedRooms) : null,
          hasPhysicalIot: lockedPkg.hasPhysicalIot,
          customerNotes: input.customerNotes ? input.customerNotes.trim() : null,
          houseId: input.houseId || null,
          status: ServiceOrderStatus.PENDING,
        },
      });

      // 7. Insert initial audit status history
      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: createdOrder.id,
          previousStatus: null,
          newStatus: ServiceOrderStatus.PENDING,
          actorUserId: customerUserId,
          actorRole: 'CUSTOMER',
          reason: 'Pesanan diajukan oleh pelanggan',
          notes: null,
        },
      });

      // 8. Fetch created order with clean customer-safe projection
      return await tx.serviceOrder.findUniqueOrThrow({
        where: { id: createdOrder.id },
        select: {
          id: true,
          orderNumber: true,
          packageName: true,
          packageCode: true,
          packagePrice: true,
          currency: true,
          packageSnapshot: true,
          contactName: true,
          contactPhone: true,
          propertyName: true,
          propertyType: true,
          propertyAddress: true,
          city: true,
          postalCode: true,
          approximateAreaM2: true,
          estimatedRooms: true,
          hasPhysicalIot: true,
          customerNotes: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  /**
   * Retrieves paginated order list for a specific customer.
   * Never exposes internal admin notes or other customers' orders.
   */
  async listCustomerOrders(customerProfileId: string, filter: ListOrdersFilter = {}) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceOrderWhereInput = {
      customerId: customerProfileId,
    };

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { packageName: { contains: term, mode: 'insensitive' } },
        { propertyName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.serviceOrder.count({ where }),
      prisma.serviceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          orderNumber: true,
          packageName: true,
          packageCode: true,
          packagePrice: true,
          currency: true,
          contactName: true,
          contactPhone: true,
          propertyName: true,
          propertyType: true,
          propertyAddress: true,
          city: true,
          status: true,
          confirmedAt: true,
          rejectedAt: true,
          rejectionReason: true,
          cancelledAt: true,
          cancellationReason: true,
          createdAt: true,
          updatedAt: true,
          assignments: {
            where: { status: AssignmentStatus.ACTIVE },
            take: 1,
            select: {
              id: true,
              assignedAt: true,
              technicianProfile: {
                select: {
                  employeeCode: true,
                  specialization: true,
                  user: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedItems = items.map((item: any) => {
      const activeAssign = item.assignments?.[0];
      const { assignments, ...rest } = item;
      return {
        ...rest,
        assignedTechnician: activeAssign
          ? {
              name: activeAssign.technicianProfile.user.name,
              employeeCode: activeAssign.technicianProfile.employeeCode,
              specialization: activeAssign.technicianProfile.specialization,
              assignedAt: activeAssign.assignedAt,
            }
          : null,
      };
    });

    return {
      items: mappedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single order detail for a customer.
   * Strips all internal adminNotes and internal history notes.
   */
  async getCustomerOrderById(customerProfileId: string, orderId: string) {
    const order = await prisma.serviceOrder.findFirst({
      where: {
        id: orderId,
        customerId: customerProfileId,
      },
      select: {
        id: true,
        orderNumber: true,
        packageName: true,
        packageCode: true,
        packagePrice: true,
        currency: true,
        packageSnapshot: true,
        contactName: true,
        contactPhone: true,
        propertyName: true,
        propertyType: true,
        propertyAddress: true,
        city: true,
        postalCode: true,
        approximateAreaM2: true,
        estimatedRooms: true,
        hasPhysicalIot: true,
        customerNotes: true,
        houseId: true,
        status: true,
        confirmedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        cancelledAt: true,
        cancellationReason: true,
        createdAt: true,
        updatedAt: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            previousStatus: true,
            newStatus: true,
            actorRole: true,
            reason: true,
            createdAt: true,
          },
        },
        assignments: {
          where: { status: AssignmentStatus.ACTIVE },
          take: 1,
          select: {
            id: true,
            assignedAt: true,
            technicianProfile: {
              select: {
                employeeCode: true,
                specialization: true,
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Pesanan layanan tidak ditemukan.', 404);
    }

    const activeAssign = (order as any).assignments?.[0];
    const { assignments, ...rest } = order as any;
    return {
      ...rest,
      assignedTechnician: activeAssign
        ? {
            name: activeAssign.technicianProfile.user.name,
            employeeCode: activeAssign.technicianProfile.employeeCode,
            specialization: activeAssign.technicianProfile.specialization,
            assignedAt: activeAssign.assignedAt,
          }
        : null,
    };
  }

  /**
   * Customer self-service cancellation.
   * Concurrency-safe: Only permitted while status === 'PENDING'.
   */
  async cancelCustomerOrder(
    customerUserId: string,
    customerProfileId: string,
    orderId: string,
    input: CancelOrderInput = {}
  ) {
    return await prisma.$transaction(async (tx) => {
      const reason = input.cancellationReason?.trim() || 'Dibatalkan oleh pelanggan';

      // Atomic conditional update
      const updateResult = await tx.serviceOrder.updateMany({
        where: {
          id: orderId,
          customerId: customerProfileId,
          status: ServiceOrderStatus.PENDING,
        },
        data: {
          status: ServiceOrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });

      if (updateResult.count === 0) {
        const currentOrder = await tx.serviceOrder.findUnique({
          where: { id: orderId },
        });

        if (!currentOrder || currentOrder.customerId !== customerProfileId) {
          throw new AppError('Pesanan layanan tidak ditemukan.', 404);
        }

        throw new AppError(
          `Pesanan tidak dapat dibatalkan karena status saat ini adalah '${currentOrder.status}'. Hanya pesanan dengan status 'PENDING' yang dapat dibatalkan.`,
          409
        );
      }

      // Record status transition in audit history
      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: orderId,
          previousStatus: ServiceOrderStatus.PENDING,
          newStatus: ServiceOrderStatus.CANCELLED,
          actorUserId: customerUserId,
          actorRole: 'CUSTOMER',
          reason,
          notes: null,
        },
      });

      return await tx.serviceOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          cancelledAt: true,
          cancellationReason: true,
          updatedAt: true,
        },
      });
    });
  }

  // =========================================================================
  // SUPER ADMIN OPERATIONS
  // =========================================================================

  /**
   * Retrieves paginated order list for Super Admin.
   * Supports filtering by status and searching across orderNumber, customer name, email,
   * phone, and package name.
   */
  async listAdminOrders(filter: ListOrdersFilter = {}) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ServiceOrderWhereInput = {};

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { packageName: { contains: term, mode: 'insensitive' } },
        { propertyName: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { contactPhone: { contains: term, mode: 'insensitive' } },
        {
          customer: {
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term, mode: 'insensitive' } },
              { user: { email: { contains: term, mode: 'insensitive' } } },
            ],
          },
        },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.serviceOrder.count({ where }),
      prisma.serviceOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          },
          confirmedByAdmin: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          rejectedByAdmin: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
          assignments: {
            where: { status: AssignmentStatus.ACTIVE },
            take: 1,
            include: {
              technicianProfile: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
              assignedByAdmin: {
                select: {
                  name: true,
                  username: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const mappedItems = items.map((item: any) => {
      const activeAssign = item.assignments?.[0];
      return {
        ...item,
        assignedTechnician: activeAssign
          ? {
              assignmentId: activeAssign.id,
              technicianProfileId: activeAssign.technicianProfile.id,
              name: activeAssign.technicianProfile.user.name,
              email: activeAssign.technicianProfile.user.email,
              employeeCode: activeAssign.technicianProfile.employeeCode,
              specialization: activeAssign.technicianProfile.specialization,
              assignedAt: activeAssign.assignedAt,
              technicianInstructions: activeAssign.technicianInstructions,
              assignedBy: activeAssign.assignedByAdmin,
            }
          : null,
      };
    });

    return {
      items: mappedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves complete order detail for Super Admin, including package snapshot,
   * full status audit history with actor details, and private admin notes.
   */
  async getAdminOrderById(orderId: string) {
    const order = await prisma.serviceOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                role: true,
                createdAt: true,
              },
            },
          },
        },
        house: {
          select: {
            id: true,
            name: true,
            address: true,
            setupStatus: true,
          },
        },
        confirmedByAdmin: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        rejectedByAdmin: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            actorUser: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
              },
            },
          },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            technicianProfile: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
            assignedByAdmin: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            revokedByAdmin: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Pesanan layanan tidak ditemukan.', 404);
    }

    const activeAssign = order.assignments.find((a) => a.status === AssignmentStatus.ACTIVE);
    return {
      ...order,
      assignedTechnician: activeAssign
        ? {
            assignmentId: activeAssign.id,
            technicianProfileId: activeAssign.technicianProfile.id,
            name: activeAssign.technicianProfile.user.name,
            email: activeAssign.technicianProfile.user.email,
            phone: activeAssign.technicianProfile.user.phone,
            employeeCode: activeAssign.technicianProfile.employeeCode,
            specialization: activeAssign.technicianProfile.specialization,
            serviceArea: activeAssign.technicianProfile.serviceArea,
            assignedAt: activeAssign.assignedAt,
            technicianInstructions: activeAssign.technicianInstructions,
            assignedBy: activeAssign.assignedByAdmin,
          }
        : null,
    };
  }

  /**
   * Super Admin confirms a PENDING order.
   * Concurrency-safe: only updates if current status is PENDING.
   */
  async confirmOrder(adminUserId: string, orderId: string, input: AdminConfirmOrderInput = {}) {
    return await prisma.$transaction(async (tx) => {
      const adminNotes = input.adminNotes?.trim() || null;

      const updateResult = await tx.serviceOrder.updateMany({
        where: {
          id: orderId,
          status: ServiceOrderStatus.PENDING,
        },
        data: {
          status: ServiceOrderStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedByAdminId: adminUserId,
          ...(adminNotes ? { adminNotes } : {}),
        },
      });

      if (updateResult.count === 0) {
        const currentOrder = await tx.serviceOrder.findUnique({
          where: { id: orderId },
        });

        if (!currentOrder) {
          throw new AppError('Pesanan layanan tidak ditemukan.', 404);
        }

        throw new AppError(
          `Pesanan tidak dapat dikonfirmasi karena status saat ini adalah '${currentOrder.status}'. Hanya pesanan dengan status 'PENDING' yang dapat dikonfirmasi.`,
          409
        );
      }

      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: orderId,
          previousStatus: ServiceOrderStatus.PENDING,
          newStatus: ServiceOrderStatus.CONFIRMED,
          actorUserId: adminUserId,
          actorRole: 'SUPER_ADMIN',
          reason: 'Pesanan dikonfirmasi oleh Super Admin',
          notes: adminNotes,
        },
      });

      return await tx.serviceOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          confirmedByAdmin: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });
    });
  }

  /**
   * Super Admin rejects a PENDING order.
   * Concurrency-safe: requires non-empty customer-visible rejectionReason and status === PENDING.
   */
  async rejectOrder(adminUserId: string, orderId: string, input: AdminRejectOrderInput) {
    if (!input.rejectionReason || input.rejectionReason.trim().length < 5) {
      throw new AppError(
        'Alasan penolakan pesanan wajib diisi (minimal 5 karakter).',
        400
      );
    }

    const rejectionReason = input.rejectionReason.trim();
    const adminNotes = input.adminNotes?.trim() || null;

    return await prisma.$transaction(async (tx) => {
      const updateResult = await tx.serviceOrder.updateMany({
        where: {
          id: orderId,
          status: ServiceOrderStatus.PENDING,
        },
        data: {
          status: ServiceOrderStatus.REJECTED,
          rejectedAt: new Date(),
          rejectedByAdminId: adminUserId,
          rejectionReason,
          ...(adminNotes ? { adminNotes } : {}),
        },
      });

      if (updateResult.count === 0) {
        const currentOrder = await tx.serviceOrder.findUnique({
          where: { id: orderId },
        });

        if (!currentOrder) {
          throw new AppError('Pesanan layanan tidak ditemukan.', 404);
        }

        throw new AppError(
          `Pesanan tidak dapat ditolak karena status saat ini adalah '${currentOrder.status}'. Hanya pesanan dengan status 'PENDING' yang dapat ditolak.`,
          409
        );
      }

      await tx.serviceOrderStatusHistory.create({
        data: {
          serviceOrderId: orderId,
          previousStatus: ServiceOrderStatus.PENDING,
          newStatus: ServiceOrderStatus.REJECTED,
          actorUserId: adminUserId,
          actorRole: 'SUPER_ADMIN',
          reason: rejectionReason,
          notes: adminNotes,
        },
      });

      return await tx.serviceOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          rejectedByAdmin: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      });
    });
  }
}

export const serviceOrderService = new ServiceOrderService();
