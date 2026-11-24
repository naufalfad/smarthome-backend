/**
 * PHASE 8: SERVICE ORDER ASSIGNMENT & DISPATCH SERVICE
 *
 * Implements transaction-safe technician assignment, reassignment,
 * immutable assignment audit history, technician availability management,
 * and role-scoped query projections for Super Admin and Technician workspaces.
 */

import { AssignmentStatus, TechnicianAvailabilityStatus, ServiceOrderStatus } from '@prisma/client';
import { prisma } from './db.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export interface AssignTechnicianInput {
  technicianProfileId: string;
  technicianInstructions?: string | null;
}

export interface ReassignTechnicianInput {
  technicianProfileId: string;
  reason: string;
  currentAssignmentId?: string | null;
  technicianInstructions?: string | null;
}

export interface TechnicianSummaryDTO {
  technicianProfileId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  employeeCode: string | null;
  specialization: string | null;
  serviceArea: string | null;
  availabilityStatus: TechnicianAvailabilityStatus;
  isActive: boolean;
  activeAssignmentCount: number;
  isEligibleForAssignment: boolean;
}

export class ServiceOrderAssignmentService {
  /**
   * Lists all technician accounts for Super Admin dispatch management,
   * including active assignment workload and eligibility status.
   */
  static async listTechniciansForDispatch(): Promise<TechnicianSummaryDTO[]> {
    const technicians = await prisma.technicianProfile.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            serviceOrderAssignments: {
              where: {
                status: AssignmentStatus.ACTIVE,
              },
            },
          },
        },
      },
      orderBy: [
        { availabilityStatus: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return technicians.map((tech) => {
      const isEligible = tech.user.isActive && tech.availabilityStatus === TechnicianAvailabilityStatus.AVAILABLE;
      return {
        technicianProfileId: tech.id,
        userId: tech.user.id,
        name: tech.user.name,
        email: tech.user.email,
        phone: tech.user.phone,
        employeeCode: tech.employeeCode,
        specialization: tech.specialization,
        serviceArea: tech.serviceArea,
        availabilityStatus: tech.availabilityStatus,
        isActive: tech.user.isActive,
        activeAssignmentCount: tech._count.serviceOrderAssignments,
        isEligibleForAssignment: isEligible,
      };
    });
  }

  /**
   * Updates a technician's availability status (Super Admin only).
   * Note: Changing availability never revokes active assignments.
   */
  static async updateTechnicianAvailability(
    technicianProfileId: string,
    newStatus: TechnicianAvailabilityStatus
  ): Promise<TechnicianSummaryDTO> {
    const validStatuses = Object.values(TechnicianAvailabilityStatus);
    if (!validStatuses.includes(newStatus)) {
      throw new AppError(
        `Status ketersediaan tidak valid: '${newStatus}'. Status yang diperbolehkan: ${validStatuses.join(', ')}`,
        400
      );
    }

    const existingTech = await prisma.technicianProfile.findUnique({
      where: { id: technicianProfileId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            serviceOrderAssignments: {
              where: {
                status: AssignmentStatus.ACTIVE,
              },
            },
          },
        },
      },
    });

    if (!existingTech) {
      throw new AppError('Profil teknisi tidak ditemukan.', 404);
    }

    const updated = await prisma.technicianProfile.update({
      where: { id: technicianProfileId },
      data: {
        availabilityStatus: newStatus,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            serviceOrderAssignments: {
              where: {
                status: AssignmentStatus.ACTIVE,
              },
            },
          },
        },
      },
    });

    const isEligible = updated.user.isActive && updated.availabilityStatus === TechnicianAvailabilityStatus.AVAILABLE;
    return {
      technicianProfileId: updated.id,
      userId: updated.user.id,
      name: updated.user.name,
      email: updated.user.email,
      phone: updated.user.phone,
      employeeCode: updated.employeeCode,
      specialization: updated.specialization,
      serviceArea: updated.serviceArea,
      availabilityStatus: updated.availabilityStatus,
      isActive: updated.user.isActive,
      activeAssignmentCount: updated._count.serviceOrderAssignments,
      isEligibleForAssignment: isEligible,
    };
  }

  /**
   * Assigns one primary technician to a CONFIRMED ServiceOrder (Super Admin only).
   * Atomically acquires row-level locks and verifies eligibility.
   */
  static async assignTechnician(
    serviceOrderId: string,
    input: AssignTechnicianInput,
    adminUserId: string
  ): Promise<any> {
    const { technicianProfileId, technicianInstructions } = input;

    if (!technicianProfileId || typeof technicianProfileId !== 'string') {
      throw new AppError('Parameter technicianProfileId wajib disertakan.', 400);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock ServiceOrder row for update to prevent concurrent assignment races
      const orderRows = await tx.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
        SELECT id, status, "orderNumber"
        FROM service_orders
        WHERE id = ${serviceOrderId}
        FOR UPDATE
      `;

      if (!orderRows || orderRows.length === 0) {
        throw new AppError('Pesanan layanan tidak ditemukan.', 404);
      }

      const order = orderRows[0];

      // 2. Validate Order is CONFIRMED
      if (order.status !== ServiceOrderStatus.CONFIRMED) {
        throw new AppError(
          `Penugasan ditolak: Hanya pesanan dengan status CONFIRMED yang dapat ditugaskan (status saat ini: ${order.status}).`,
          409
        );
      }

      // 3. Lock and validate target technician
      const techRows = await tx.$queryRaw<Array<{ id: string; availabilityStatus: string; isActive: boolean }>>`
        SELECT tp.id, tp."availabilityStatus", u."isActive"
        FROM technician_profiles tp
        JOIN users u ON u.id = tp."userId"
        WHERE tp.id = ${technicianProfileId}
        FOR SHARE
      `;

      if (!techRows || techRows.length === 0) {
        throw new AppError('Profil teknisi tidak ditemukan.', 404);
      }

      const tech = techRows[0];

      if (!tech.isActive) {
        throw new AppError('Penugasan ditolak: Akun pengguna teknisi sedang tidak aktif.', 400);
      }

      if (tech.availabilityStatus !== TechnicianAvailabilityStatus.AVAILABLE) {
        throw new AppError(
          `Penugasan ditolak: Teknisi tidak memenuhi syarat penugasan baru (status ketersediaan saat ini: ${tech.availabilityStatus}).`,
          400
        );
      }

      // 4. Check for completed assignment (Handover completed)
      const completedAssignment = await tx.serviceOrderAssignment.findFirst({
        where: {
          serviceOrderId,
          status: AssignmentStatus.COMPLETED,
        },
      });
      if (completedAssignment) {
        throw new AppError(
          'Penugasan ditolak: Penugasan untuk pesanan ini telah selesai (COMPLETED) dan tidak dapat ditugaskan kembali.',
          409
        );
      }

      // 4b. Check for existing active assignment
      const activeAssignment = await tx.serviceOrderAssignment.findFirst({
        where: {
          serviceOrderId,
          status: AssignmentStatus.ACTIVE,
        },
      });

      if (activeAssignment) {
        if (activeAssignment.technicianProfileId === technicianProfileId) {
          throw new AppError(
            'ALREADY_ASSIGNED: Teknisi ini sudah aktif ditugaskan pada pesanan ini.',
            409
          );
        }
        throw new AppError(
          'Pesanan ini sudah memiliki teknisi aktif. Gunakan fitur pengalihan tugas (reassign) untuk mengganti teknisi.',
          409
        );
      }

      // 5. Create new ACTIVE assignment
      const newAssignment = await tx.serviceOrderAssignment.create({
        data: {
          serviceOrderId,
          technicianProfileId,
          assignedByAdminId: adminUserId,
          status: AssignmentStatus.ACTIVE,
          technicianInstructions: technicianInstructions?.trim() || null,
        },
        include: {
          technicianProfile: {
            include: {
              user: {
                select: {
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
      });

      return {
        id: newAssignment.id,
        serviceOrderId: newAssignment.serviceOrderId,
        status: newAssignment.status,
        assignedAt: newAssignment.assignedAt,
        technicianInstructions: newAssignment.technicianInstructions,
        technician: {
          technicianProfileId: newAssignment.technicianProfile.id,
          name: newAssignment.technicianProfile.user.name,
          employeeCode: newAssignment.technicianProfile.employeeCode,
          specialization: newAssignment.technicianProfile.specialization,
          serviceArea: newAssignment.technicianProfile.serviceArea,
        },
        assignedBy: {
          name: newAssignment.assignedByAdmin.name,
          username: newAssignment.assignedByAdmin.username,
        },
      };
    });
  }

  /**
   * Reassigns an existing confirmed ServiceOrder to a new technician (Super Admin only).
   * Atomically revokes the current active assignment and creates a new active assignment.
   */
  static async reassignTechnician(
    serviceOrderId: string,
    input: ReassignTechnicianInput,
    adminUserId: string
  ): Promise<any> {
    const { technicianProfileId, reason, technicianInstructions } = input;

    // Validate reason: at least 5 non-whitespace characters
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw new AppError(
        'Alasan pengalihan tugas wajib diisi (minimal 5 karakter non-whitespace).',
        400
      );
    }

    if (!technicianProfileId || typeof technicianProfileId !== 'string') {
      throw new AppError('Parameter technicianProfileId wajib disertakan.', 400);
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Lock ServiceOrder row for update
      const orderRows = await tx.$queryRaw<Array<{ id: string; status: string; orderNumber: string }>>`
        SELECT id, status, "orderNumber"
        FROM service_orders
        WHERE id = ${serviceOrderId}
        FOR UPDATE
      `;

      if (!orderRows || orderRows.length === 0) {
        throw new AppError('Pesanan layanan tidak ditemukan.', 404);
      }

      const order = orderRows[0];

      if (order.status !== ServiceOrderStatus.CONFIRMED) {
        throw new AppError(
          `Pengalihan tugas ditolak: Hanya pesanan dengan status CONFIRMED yang dapat dialihkan (status saat ini: ${order.status}).`,
          409
        );
      }

      // 1b. Check if order assignment is already COMPLETED
      const completedAssignment = await tx.serviceOrderAssignment.findFirst({
        where: {
          serviceOrderId,
          status: AssignmentStatus.COMPLETED,
        },
      });
      if (completedAssignment) {
        throw new AppError(
          'Pengalihan tugas ditolak: Penugasan untuk pesanan ini telah selesai (COMPLETED) dan tidak dapat dialihkan.',
          409
        );
      }

      // 2. Locate current active assignment
      const currentActive = await tx.serviceOrderAssignment.findFirst({
        where: {
          serviceOrderId,
          status: AssignmentStatus.ACTIVE,
        },
      });

      if (!currentActive) {
        throw new AppError(
          'Pesanan ini belum memiliki teknisi aktif. Gunakan penugasan awal terlebih dahulu.',
          409
        );
      }

      // 3. Reject reassignment to the exact same technician
      if (currentActive.technicianProfileId === technicianProfileId) {
        throw new AppError(
          'ALREADY_ASSIGNED: Teknisi pengganti sama dengan teknisi yang saat ini sedang aktif ditugaskan.',
          409
        );
      }

      // 3b. Optional optimistic concurrency check: verify active assignment ID has not changed
      if (input.currentAssignmentId && currentActive.id !== input.currentAssignmentId) {
        throw new AppError(
          'ASSIGNMENT_SUPERSEDED: Penugasan telah diperbarui atau dialihkan oleh administrator lain.',
          409
        );
      }

      // 4. Lock and validate replacement technician
      const techRows = await tx.$queryRaw<Array<{ id: string; availabilityStatus: string; isActive: boolean }>>`
        SELECT tp.id, tp."availabilityStatus", u."isActive"
        FROM technician_profiles tp
        JOIN users u ON u.id = tp."userId"
        WHERE tp.id = ${technicianProfileId}
        FOR SHARE
      `;

      if (!techRows || techRows.length === 0) {
        throw new AppError('Profil teknisi pengganti tidak ditemukan.', 404);
      }

      const replacementTech = techRows[0];

      if (!replacementTech.isActive) {
        throw new AppError('Pengalihan tugas ditolak: Akun pengguna teknisi pengganti sedang tidak aktif.', 400);
      }

      if (replacementTech.availabilityStatus !== TechnicianAvailabilityStatus.AVAILABLE) {
        throw new AppError(
          `Pengalihan tugas ditolak: Teknisi pengganti tidak memenuhi syarat penugasan baru (status ketersediaan saat ini: ${replacementTech.availabilityStatus}).`,
          400
        );
      }

      // 5. Revoke current active assignment
      const now = new Date();
      await tx.serviceOrderAssignment.update({
        where: { id: currentActive.id },
        data: {
          status: AssignmentStatus.REVOKED,
          revokedAt: now,
          revokedByAdminId: adminUserId,
          reassignmentReason: reason.trim(),
        },
      });

      // 6. Insert new ACTIVE assignment
      const newAssignment = await tx.serviceOrderAssignment.create({
        data: {
          serviceOrderId,
          technicianProfileId,
          assignedByAdminId: adminUserId,
          status: AssignmentStatus.ACTIVE,
          reassignmentReason: reason.trim(),
          technicianInstructions: technicianInstructions?.trim() || null,
        },
        include: {
          technicianProfile: {
            include: {
              user: {
                select: {
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
      });

      return {
        id: newAssignment.id,
        serviceOrderId: newAssignment.serviceOrderId,
        status: newAssignment.status,
        assignedAt: newAssignment.assignedAt,
        technicianInstructions: newAssignment.technicianInstructions,
        technician: {
          technicianProfileId: newAssignment.technicianProfile.id,
          name: newAssignment.technicianProfile.user.name,
          employeeCode: newAssignment.technicianProfile.employeeCode,
          specialization: newAssignment.technicianProfile.specialization,
          serviceArea: newAssignment.technicianProfile.serviceArea,
        },
        assignedBy: {
          name: newAssignment.assignedByAdmin.name,
          username: newAssignment.assignedByAdmin.username,
        },
        previousAssignmentRevoked: {
          assignmentId: currentActive.id,
          revokedAt: now,
          reassignmentReason: reason.trim(),
        },
      };
    });
  }

  /**
   * Retrieves full chronological assignment history for an order (Super Admin only).
   */
  static async getOrderAssignmentHistory(serviceOrderId: string): Promise<any[]> {
    const order = await prisma.serviceOrder.findUnique({
      where: { id: serviceOrderId },
      select: { id: true, orderNumber: true },
    });

    if (!order) {
      throw new AppError('Pesanan layanan tidak ditemukan.', 404);
    }

    const assignments = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId },
      include: {
        technicianProfile: {
          include: {
            user: {
              select: {
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
        revokedByAdmin: {
          select: {
            name: true,
            username: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'desc',
      },
    });

    return assignments.map((a) => ({
      id: a.id,
      status: a.status,
      assignedAt: a.assignedAt,
      revokedAt: a.revokedAt,
      reassignmentReason: a.reassignmentReason,
      technicianInstructions: a.technicianInstructions,
      technician: {
        technicianProfileId: a.technicianProfile.id,
        name: a.technicianProfile.user.name,
        employeeCode: a.technicianProfile.employeeCode,
        specialization: a.technicianProfile.specialization,
        serviceArea: a.technicianProfile.serviceArea,
      },
      assignedBy: {
        name: a.assignedByAdmin.name,
        username: a.assignedByAdmin.username,
      },
      revokedBy: a.revokedByAdmin
        ? {
            name: a.revokedByAdmin.name,
            username: a.revokedByAdmin.username,
          }
        : null,
    }));
  }

  /**
   * Retrieves currently ACTIVE assignments for the authenticated technician.
   * Strictly scoped to req.user.technicianProfileId.
   */
  static async getTechnicianActiveAssignments(technicianProfileId: string): Promise<any[]> {
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const assignments = await prisma.serviceOrderAssignment.findMany({
      where: {
        technicianProfileId,
        status: AssignmentStatus.ACTIVE,
      },
      include: {
        serviceOrder: {
          include: {
            customer: {
              select: {
                fullName: true,
              },
            },
            fieldSurvey: {
              select: {
                id: true,
                status: true,
              },
            },
            house: {
              select: {
                id: true,
                name: true,
                setupStatus: true,
              },
            },
          },
        },
      },
      orderBy: {
        assignedAt: 'desc',
      },
    });

    return assignments.map((a) => {
      const order = a.serviceOrder;
      return {
        assignmentId: a.id,
        status: a.status,
        assignedAt: a.assignedAt,
        technicianInstructions: a.technicianInstructions,
        serviceOrder: {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customer.fullName,
          contactName: order.contactName,
          contactPhone: order.contactPhone,
          propertyName: order.propertyName,
          propertyType: order.propertyType,
          propertyAddress: order.propertyAddress,
          city: order.city,
          postalCode: order.postalCode,
          approximateAreaM2: order.approximateAreaM2 ? Number(order.approximateAreaM2) : null,
          estimatedRooms: order.estimatedRooms,
          customerNotes: order.customerNotes,
          packageName: order.packageName,
          packageCode: order.packageCode,
          packageSnapshot: order.packageSnapshot
            ? (() => {
                const snap = order.packageSnapshot as any;
                const { price, ...safeSnap } = snap;
                return safeSnap;
              })()
            : null,
          confirmedAt: order.confirmedAt,
          houseId: order.houseId,
          house: order.house
            ? {
                id: order.house.id,
                name: order.house.name,
                setupStatus: order.house.setupStatus,
              }
            : null,
          fieldSurvey: order.fieldSurvey
            ? {
                id: order.fieldSurvey.id,
                status: order.fieldSurvey.status,
              }
            : null,
        },
      };
    });
  }

  /**
   * Retrieves detail of a single ACTIVE assignment for the authenticated technician.
   * Returns 404 if not found or revoked (non-disclosing IDOR defense).
   * Works cleanly whether houseId is present or null.
   */
  static async getTechnicianAssignmentDetail(
    assignmentId: string,
    technicianProfileId: string
  ): Promise<any> {
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const assignment = await prisma.serviceOrderAssignment.findFirst({
      where: {
        id: assignmentId,
        technicianProfileId,
        status: AssignmentStatus.ACTIVE,
      },
      include: {
        serviceOrder: {
          include: {
            customer: {
              select: {
                fullName: true,
              },
            },
            fieldSurvey: {
              select: {
                id: true,
                status: true,
              },
            },
            house: {
              select: {
                id: true,
                name: true,
                setupStatus: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new AppError('Penugasan kerja tidak ditemukan atau sudah dialihkan.', 404);
    }

    const order = assignment.serviceOrder;
    return {
      assignmentId: assignment.id,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      technicianInstructions: assignment.technicianInstructions,
      serviceOrder: {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customer.fullName,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
        propertyName: order.propertyName,
        propertyType: order.propertyType,
        propertyAddress: order.propertyAddress,
        city: order.city,
        postalCode: order.postalCode,
        approximateAreaM2: order.approximateAreaM2 ? Number(order.approximateAreaM2) : null,
        estimatedRooms: order.estimatedRooms,
        customerNotes: order.customerNotes,
        packageName: order.packageName,
        packageCode: order.packageCode,
        packageSnapshot: order.packageSnapshot
          ? (() => {
              const snap = order.packageSnapshot as any;
              const { price, ...safeSnap } = snap;
              return safeSnap;
            })()
          : null,
        confirmedAt: order.confirmedAt,
        houseId: order.houseId,
        house: order.house
          ? {
              id: order.house.id,
              name: order.house.name,
              setupStatus: order.house.setupStatus,
            }
          : null,
        fieldSurvey: order.fieldSurvey
          ? {
              id: order.fieldSurvey.id,
              status: order.fieldSurvey.status,
            }
          : null,
      },
    };
  }
}
