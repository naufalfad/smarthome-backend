/**
 * PHASE 9: COMMERCIAL FIELD SURVEY EXECUTION SERVICE
 *
 * Implements field survey draft management, multi-room inventory, electrical/network audits,
 * order-scoped internal survey photo storage, Super Admin revision workflow, and idempotent
 * canonical House entity creation with Floor and Room initialization.
 */

import fs from 'fs';
import path from 'path';
import {
  Prisma,
  FieldSurveyStatus,
  SurveyPhotoCategory,
  AssignmentStatus,
  PropertySetupStatus,
  PropertyType,
  RoomType,
} from '@prisma/client';
import { prisma } from './db.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import {
  getOrderSurveyDirectory,
  resolveOrderSurveyPhotoPath,
  resolveUploadPath,
  sanitizeStorageFilename,
} from '../utils/storage-path.util.js';

export interface SurveyRoomItemInput {
  id?: string;
  roomName: string;
  roomType?: RoomType;
  floorLevel?: number;
  lengthMeters?: number | string | null;
  widthMeters?: number | string | null;
  heightMeters?: number | string | null;
  wallOutletsCount?: number;
  lightSwitchesCount?: number;
  existingAcUnits?: number;
  acUnitModel?: string | null;
  notes?: string | null;
  displayOrder?: number;
}

export interface SaveSurveyDraftInput {
  buildingType?: string | null;
  totalFloors?: number;
  estimatedAreaM2?: number | string | null;
  wallStructureMaterial?: string | null;
  ceilingHeightMeters?: number | string | null;
  mainBreakerAmps?: number | null;
  mainsVoltageVolts?: number | string | null;
  groundingStatus?: string | null;
  hasSubPanels?: boolean;
  subPanelLocations?: string | null;
  electricalNotes?: string | null;
  ispProvider?: string | null;
  connectionType?: string | null;
  measuredDownloadSpeed?: number | string | null;
  measuredUploadSpeed?: number | string | null;
  mainRouterLocation?: string | null;
  wifiCoverageRating?: string | null;
  networkNotes?: string | null;
  customerSpecialRequests?: string | null;
  installationObstacles?: string | null;
  technicianNotes?: string | null;
  rooms?: SurveyRoomItemInput[];
}

export class FieldSurveyService {
  /**
   * Helper: Validates that the assignment exists, belongs to the authenticated technician,
   * and is currently ACTIVE.
   */
  private static async getActiveAssignmentOrThrow(
    technicianProfileId: string,
    assignmentId: string
  ) {
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
            customer: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new AppError(
        'Penugasan kerja tidak ditemukan atau sudah dialihkan.',
        404
      );
    }

    return assignment;
  }

  /**
   * Retrieves or initializes the FieldSurvey for an assigned order.
   */
  static async getOrCreateSurvey(
    technicianProfileId: string,
    assignmentId: string
  ): Promise<any> {
    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );
    const serviceOrderId = assignment.serviceOrderId;

    let survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId },
      include: {
        rooms: { orderBy: { displayOrder: 'asc' } },
        photos: { orderBy: { createdAt: 'desc' } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!survey) {
      // Create initial DRAFT survey
      survey = await prisma.fieldSurvey.create({
        data: {
          serviceOrderId,
          assignmentId: assignment.id,
          technicianProfileId,
          status: FieldSurveyStatus.DRAFT,
          totalFloors: 1,
          estimatedAreaM2: assignment.serviceOrder.approximateAreaM2,
        },
        include: {
          rooms: true,
          photos: true,
          history: true,
        },
      });

      // Record initial history
      await prisma.fieldSurveyHistory.create({
        data: {
          surveyId: survey.id,
          previousStatus: null,
          newStatus: FieldSurveyStatus.DRAFT,
          actorUserId: assignment.assignedByAdminId,
          actorRole: 'TECHNICIAN',
          actionNote: 'Draf survei lapangan diinisialisasi oleh teknisi.',
        },
      });
    }

    return {
      ...survey,
      packageSnapshot: assignment.serviceOrder.packageSnapshot,
    };
  }

  /**
   * Saves or updates a survey draft (Rooms, Building, Electrical, Wi-Fi).
   */
  static async saveSurveyDraft(
    technicianProfileId: string,
    assignmentId: string,
    input: SaveSurveyDraftInput
  ): Promise<any> {
    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );
    const serviceOrderId = assignment.serviceOrderId;

    const survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId },
    });

    if (!survey) {
      throw new AppError('Draf survei belum diinisialisasi.', 404);
    }

    if (
      survey.status === FieldSurveyStatus.SUBMITTED ||
      survey.status === FieldSurveyStatus.VERIFIED
    ) {
      throw new AppError(
        `Survei dengan status '${survey.status}' tidak dapat diubah drafnya.`,
        409
      );
    }

    return await prisma.$transaction(async (tx) => {
      // Convert decimal inputs safely
      const estimatedAreaM2 =
        input.estimatedAreaM2 !== undefined && input.estimatedAreaM2 !== null && input.estimatedAreaM2 !== ''
          ? new Prisma.Decimal(Number(input.estimatedAreaM2).toFixed(2))
          : undefined;

      const ceilingHeightMeters =
        input.ceilingHeightMeters !== undefined && input.ceilingHeightMeters !== null && input.ceilingHeightMeters !== ''
          ? new Prisma.Decimal(Number(input.ceilingHeightMeters).toFixed(2))
          : undefined;

      const mainsVoltageVolts =
        input.mainsVoltageVolts !== undefined && input.mainsVoltageVolts !== null && input.mainsVoltageVolts !== ''
          ? new Prisma.Decimal(Number(input.mainsVoltageVolts).toFixed(1))
          : undefined;

      const measuredDownloadSpeed =
        input.measuredDownloadSpeed !== undefined && input.measuredDownloadSpeed !== null && input.measuredDownloadSpeed !== ''
          ? new Prisma.Decimal(Number(input.measuredDownloadSpeed).toFixed(2))
          : undefined;

      const measuredUploadSpeed =
        input.measuredUploadSpeed !== undefined && input.measuredUploadSpeed !== null && input.measuredUploadSpeed !== ''
          ? new Prisma.Decimal(Number(input.measuredUploadSpeed).toFixed(2))
          : undefined;

      // Update survey fields
      const updated = await tx.fieldSurvey.update({
        where: { id: survey.id },
        data: {
          buildingType: input.buildingType ?? undefined,
          totalFloors: input.totalFloors !== undefined ? Math.max(1, Number(input.totalFloors)) : undefined,
          estimatedAreaM2,
          wallStructureMaterial: input.wallStructureMaterial ?? undefined,
          ceilingHeightMeters,
          mainBreakerAmps: input.mainBreakerAmps !== undefined ? Number(input.mainBreakerAmps) : undefined,
          mainsVoltageVolts,
          groundingStatus: input.groundingStatus ?? undefined,
          hasSubPanels: input.hasSubPanels ?? undefined,
          subPanelLocations: input.subPanelLocations ?? undefined,
          electricalNotes: input.electricalNotes ?? undefined,
          ispProvider: input.ispProvider ?? undefined,
          connectionType: input.connectionType ?? undefined,
          measuredDownloadSpeed,
          measuredUploadSpeed,
          mainRouterLocation: input.mainRouterLocation ?? undefined,
          wifiCoverageRating: input.wifiCoverageRating ?? undefined,
          networkNotes: input.networkNotes ?? undefined,
          customerSpecialRequests: input.customerSpecialRequests ?? undefined,
          installationObstacles: input.installationObstacles ?? undefined,
          technicianNotes: input.technicianNotes ?? undefined,
        },
      });

      // Synchronize room items if provided
      if (input.rooms && Array.isArray(input.rooms)) {
        await tx.surveyRoomItem.deleteMany({
          where: { surveyId: survey.id },
        });

        for (let i = 0; i < input.rooms.length; i++) {
          const r = input.rooms[i];
          const lengthMeters =
            r.lengthMeters !== undefined && r.lengthMeters !== null && r.lengthMeters !== ''
              ? new Prisma.Decimal(Number(r.lengthMeters).toFixed(2))
              : null;
          const widthMeters =
            r.widthMeters !== undefined && r.widthMeters !== null && r.widthMeters !== ''
              ? new Prisma.Decimal(Number(r.widthMeters).toFixed(2))
              : null;
          const heightMeters =
            r.heightMeters !== undefined && r.heightMeters !== null && r.heightMeters !== ''
              ? new Prisma.Decimal(Number(r.heightMeters).toFixed(2))
              : null;

          await tx.surveyRoomItem.create({
            data: {
              surveyId: survey.id,
              roomName: r.roomName.trim(),
              roomType: r.roomType || RoomType.OTHER,
              floorLevel: r.floorLevel || 1,
              lengthMeters,
              widthMeters,
              heightMeters,
              wallOutletsCount: r.wallOutletsCount ?? 2,
              lightSwitchesCount: r.lightSwitchesCount ?? 1,
              existingAcUnits: r.existingAcUnits ?? 0,
              acUnitModel: r.acUnitModel?.trim() || null,
              notes: r.notes?.trim() || null,
              displayOrder: i,
            },
          });
        }
      }

      return await tx.fieldSurvey.findUniqueOrThrow({
        where: { id: survey.id },
        include: {
          rooms: { orderBy: { displayOrder: 'asc' } },
          photos: { orderBy: { createdAt: 'desc' } },
        },
      });
    });
  }

  /**
   * Sets the scheduled field survey date.
   */
  static async scheduleSurveyVisit(
    technicianProfileId: string,
    assignmentId: string,
    scheduledDate: string | Date
  ): Promise<any> {
    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );

    const parsedDate = new Date(scheduledDate);
    if (isNaN(parsedDate.getTime())) {
      throw new AppError('Format tanggal jadwal survei tidak valid.', 400);
    }

    let survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId: assignment.serviceOrderId },
    });

    if (!survey) {
      survey = await prisma.fieldSurvey.create({
        data: {
          serviceOrderId: assignment.serviceOrderId,
          assignmentId: assignment.id,
          technicianProfileId,
          status: FieldSurveyStatus.DRAFT,
          scheduledDate: parsedDate,
        },
      });
    } else {
      survey = await prisma.fieldSurvey.update({
        where: { id: survey.id },
        data: { scheduledDate: parsedDate },
      });
    }

    return survey;
  }

  /**
   * Uploads and stores an internal survey photograph under order-scoped directory:
   * backend/uploads/surveys/orders/{orderId}/{filename}
   */
  static async uploadSurveyPhoto(
    technicianProfileId: string,
    assignmentId: string,
    file: Express.Multer.File,
    category: SurveyPhotoCategory,
    title: string,
    caption?: string
  ): Promise<any> {
    if (!file) {
      throw new AppError('Berkas foto survei wajib disertakan.', 400);
    }

    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );
    const serviceOrderId = assignment.serviceOrderId;

    let survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId },
    });

    if (!survey) {
      survey = await prisma.fieldSurvey.create({
        data: {
          serviceOrderId,
          assignmentId: assignment.id,
          technicianProfileId,
          status: FieldSurveyStatus.DRAFT,
        },
      });
    }

    if (
      survey.status === FieldSurveyStatus.SUBMITTED ||
      survey.status === FieldSurveyStatus.VERIFIED
    ) {
      throw new AppError(
        `Tidak dapat mengunggah foto: status survei saat ini adalah '${survey.status}'.`,
        409
      );
    }

    // Prepare safe order-scoped destination
    const orderSurveyDir = getOrderSurveyDirectory(serviceOrderId);
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeBase = sanitizeStorageFilename(path.basename(file.originalname, ext)) || 'photo';
    const uniqueFilename = `survey_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const destinationPath = path.resolve(orderSurveyDir, uniqueFilename);

    // If file was temporarily written or buffered, save to orderSurveyDir
    if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, destinationPath);
      try {
        fs.unlinkSync(file.path);
      } catch {}
    } else if (file.buffer) {
      fs.writeFileSync(destinationPath, file.buffer);
    } else {
      throw new AppError('Gagal memproses data berkas foto survei.', 500);
    }

    const relativeFilePath = `uploads/surveys/orders/${serviceOrderId}/${uniqueFilename}`;

    const surveyPhoto = await prisma.surveyPhoto.create({
      data: {
        surveyId: survey.id,
        category: category || SurveyPhotoCategory.OTHER,
        title: title?.trim() || safeBase,
        fileName: uniqueFilename,
        filePath: relativeFilePath,
        fileSize: file.size,
        mimeType: file.mimetype || 'image/jpeg',
        caption: caption?.trim() || null,
      },
    });

    return surveyPhoto;
  }

  /**
   * Deletes a draft survey photo.
   */
  static async deleteSurveyPhoto(
    technicianProfileId: string,
    assignmentId: string,
    photoId: string
  ): Promise<void> {
    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );

    const photo = await prisma.surveyPhoto.findFirst({
      where: {
        id: photoId,
        survey: {
          serviceOrderId: assignment.serviceOrderId,
        },
      },
      include: { survey: true },
    });

    if (!photo) {
      throw new AppError('Foto survei tidak ditemukan.', 404);
    }

    if (
      photo.survey.status === FieldSurveyStatus.SUBMITTED ||
      photo.survey.status === FieldSurveyStatus.VERIFIED
    ) {
      throw new AppError(
        'Foto tidak dapat dihapus karena survei sudah dikirim atau diverifikasi.',
        409
      );
    }

    // Remove file on disk if exists
    const absPath = resolveUploadPath(photo.filePath);
    if (absPath && fs.existsSync(absPath)) {
      try {
        fs.unlinkSync(absPath);
      } catch {}
    }

    await prisma.surveyPhoto.delete({
      where: { id: photoId },
    });
  }

  /**
   * Submits the field survey for Super Admin review.
   * Enforces mandatory preconditions:
   * - Minimum 1 room item
   * - Mandatory electrical info (breaker amps & mains voltage)
   * - Minimum 1 survey photo
   */
  static async submitSurvey(
    technicianProfileId: string,
    assignmentId: string
  ): Promise<any> {
    const assignment = await this.getActiveAssignmentOrThrow(
      technicianProfileId,
      assignmentId
    );
    const serviceOrderId = assignment.serviceOrderId;

    const survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId },
      include: {
        rooms: true,
        photos: true,
      },
    });

    if (!survey) {
      throw new AppError('Draf survei belum ditemukan.', 404);
    }

    if (
      survey.status !== FieldSurveyStatus.DRAFT &&
      survey.status !== FieldSurveyStatus.REVISION_REQUIRED
    ) {
      throw new AppError(
        `Survei tidak dapat dikirim karena status saat ini adalah '${survey.status}'.`,
        409
      );
    }

    // Validation 1: At least 1 room item
    if (!survey.rooms || survey.rooms.length === 0) {
      throw new AppError(
        'Pengiriman survei ditolak: Minimal 1 ruangan wajib diinventarisasi.',
        400
      );
    }

    // Validation 2: Mandatory electrical information
    if (!survey.mainBreakerAmps || !survey.mainsVoltageVolts) {
      throw new AppError(
        'Pengiriman survei ditolak: Spesifikasi kelistrikan (kapasitas MCB dan tegangan listrik) wajib diisi.',
        400
      );
    }

    // Validation 3: At least 1 photo
    if (!survey.photos || survey.photos.length === 0) {
      throw new AppError(
        'Pengiriman survei ditolak: Minimal 1 foto dokumentasi survei wajib diunggah.',
        400
      );
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.fieldSurvey.update({
        where: { id: survey.id },
        data: {
          status: FieldSurveyStatus.SUBMITTED,
          submittedAt: now,
          surveyedAt: survey.surveyedAt || now,
        },
        include: {
          rooms: true,
          photos: true,
        },
      });

      await tx.fieldSurveyHistory.create({
        data: {
          surveyId: survey.id,
          previousStatus: survey.status,
          newStatus: FieldSurveyStatus.SUBMITTED,
          actorUserId: assignment.assignedByAdminId,
          actorRole: 'TECHNICIAN',
          actionNote: 'Survei lapangan diselesaikan dan diajukan untuk verifikasi.',
        },
      });

      return result;
    });

    return updated;
  }

  /**
   * Super Admin: Retrieves complete survey details with room items, photos, and history.
   */
  static async getSurveyForAdmin(orderId: string): Promise<any> {
    const survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId: orderId },
      include: {
        rooms: { orderBy: { displayOrder: 'asc' } },
        photos: { orderBy: { createdAt: 'desc' } },
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            actorUser: {
              select: { id: true, name: true, username: true, role: true },
            },
          },
        },
        technicianProfile: {
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        },
        serviceOrder: {
          select: {
            id: true,
            orderNumber: true,
            packageName: true,
            packageCode: true,
            packageSnapshot: true,
            propertyName: true,
            propertyAddress: true,
            houseId: true,
            status: true,
          },
        },
      },
    });

    if (!survey) {
      throw new AppError('Survei lapangan belum diisi untuk pesanan ini.', 404);
    }

    return survey;
  }

  /**
   * Super Admin: Requests revision on a submitted survey.
   * Requires non-empty revisionReason (min 5 non-whitespace chars).
   */
  static async requestSurveyRevision(
    adminUserId: string,
    orderId: string,
    revisionReason: string,
    adminNotes?: string
  ): Promise<any> {
    if (!revisionReason || revisionReason.trim().length < 5) {
      throw new AppError(
        'Alasan permintaan perbaikan survei wajib diisi (minimal 5 karakter non-whitespace).',
        400
      );
    }

    const survey = await prisma.fieldSurvey.findUnique({
      where: { serviceOrderId: orderId },
    });

    if (!survey) {
      throw new AppError('Survei lapangan tidak ditemukan.', 404);
    }

    if (survey.status !== FieldSurveyStatus.SUBMITTED) {
      throw new AppError(
        `Permintaan revisi ditolak: Hanya survei berstatus SUBMITTED yang dapat direvisi (status saat ini: ${survey.status}).`,
        409
      );
    }

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.fieldSurvey.update({
        where: { id: survey.id },
        data: {
          status: FieldSurveyStatus.REVISION_REQUIRED,
          revisionReason: revisionReason.trim(),
          adminReviewNotes: adminNotes?.trim() || null,
        },
        include: {
          rooms: true,
          photos: true,
        },
      });

      await tx.fieldSurveyHistory.create({
        data: {
          surveyId: survey.id,
          previousStatus: FieldSurveyStatus.SUBMITTED,
          newStatus: FieldSurveyStatus.REVISION_REQUIRED,
          actorUserId: adminUserId,
          actorRole: 'SUPER_ADMIN',
          actionNote: `Permintaan revisi: ${revisionReason.trim()}`,
        },
      });

      return updated;
    });
  }

  /**
   * Super Admin: Verifies survey and atomically creates the canonical House entity.
   * Fully idempotent: Retrying verification returns existing House without duplicates.
   */
  static async verifySurveyAndCreateHouse(
    adminUserId: string,
    orderId: string,
    adminNotes?: string
  ): Promise<{ house: any; survey: any; alreadyCreated: boolean }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Lock ServiceOrder row FOR UPDATE (prevents race conditions)
      const orderRows = await tx.$queryRaw<
        Array<{
          id: string;
          customerId: string;
          propertyName: string;
          propertyAddress: string;
          propertyType: string;
          hasPhysicalIot: boolean;
          houseId: string | null;
          status: string;
        }>
      >`
        SELECT id, "customerId", "propertyName", "propertyAddress", "propertyType", 
               "hasPhysicalIot", "houseId", status
        FROM service_orders 
        WHERE id = ${orderId} 
        FOR UPDATE
      `;

      if (!orderRows || orderRows.length === 0) {
        throw new AppError('Pesanan layanan tidak ditemukan.', 404);
      }

      const order = orderRows[0];

      // 2. IDEMPOTENCY CHECK: If houseId already exists, return existing house cleanly
      if (order.houseId) {
        const existingHouse = await tx.house.findUniqueOrThrow({
          where: { id: order.houseId },
          include: {
            floors: {
              include: { floorPlan: true },
            },
          },
        });
        const survey = await tx.fieldSurvey.findUniqueOrThrow({
          where: { serviceOrderId: orderId },
        });
        return { house: existingHouse, survey, alreadyCreated: true };
      }

      // 3. Locate FieldSurvey and verify SUBMITTED status
      const survey = await tx.fieldSurvey.findUnique({
        where: { serviceOrderId: orderId },
        include: { rooms: { orderBy: { displayOrder: 'asc' } } },
      });

      if (!survey) {
        throw new AppError('Survei lapangan tidak ditemukan untuk pesanan ini.', 404);
      }

      if (survey.status !== FieldSurveyStatus.SUBMITTED) {
        throw new AppError(
          `Verifikasi ditolak: Hanya survei dengan status SUBMITTED yang dapat diverifikasi (status saat ini: ${survey.status}).`,
          409
        );
      }

      // 4. Create Canonical House Entity with setupStatus CONFIGURING
      const totalFloors = Math.max(1, survey.totalFloors || 1);
      const newHouse = await tx.house.create({
        data: {
          name: order.propertyName,
          address: order.propertyAddress,
          propertyType: (order.propertyType as PropertyType) || PropertyType.HOUSE,
          hasPhysicalIot: order.hasPhysicalIot,
          setupStatus: PropertySetupStatus.CONFIGURING,
          customerId: order.customerId,
          floors: {
            create: Array.from({ length: totalFloors }, (_, idx) => ({
              name: `Lantai ${idx + 1}`,
              levelNumber: idx + 1,
              floorPlan: {
                create: {
                  name: `Denah Lantai ${idx + 1}`,
                  viewBoxWidth: 1600,
                  viewBoxHeight: 1000,
                },
              },
            })),
          },
        },
        include: {
          floors: {
            include: { floorPlan: true },
          },
        },
      });

      // 5. Populate Room records under appropriate floors
      const floorMap = new Map<number, string>();
      newHouse.floors.forEach((f) => floorMap.set(f.levelNumber, f.id));

      if (survey.rooms.length > 0) {
        for (const roomItem of survey.rooms) {
          const floorId = floorMap.get(roomItem.floorLevel) || newHouse.floors[0].id;
          const area =
            roomItem.lengthMeters && roomItem.widthMeters
              ? Number(roomItem.lengthMeters) * Number(roomItem.widthMeters)
              : null;

          await tx.room.create({
            data: {
              floorId,
              name: roomItem.roomName,
              type: roomItem.roomType,
              floor: roomItem.floorLevel,
              areaSquareMeters: area,
              isActive: true,
            },
          });
        }
      }

      // 6. Link newly created House to ServiceOrder
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { houseId: newHouse.id },
      });

      // 7. Update FieldSurvey status to VERIFIED
      const updatedSurvey = await tx.fieldSurvey.update({
        where: { id: survey.id },
        data: {
          status: FieldSurveyStatus.VERIFIED,
          verifiedAt: new Date(),
          verifiedByAdminId: adminUserId,
          adminReviewNotes: adminNotes?.trim() || null,
        },
      });

      // 8. Log FieldSurveyHistory transition
      await tx.fieldSurveyHistory.create({
        data: {
          surveyId: survey.id,
          previousStatus: FieldSurveyStatus.SUBMITTED,
          newStatus: FieldSurveyStatus.VERIFIED,
          actorUserId: adminUserId,
          actorRole: 'SUPER_ADMIN',
          actionNote: 'Survei diverifikasi dan entitas House kanonikal berhasil dibuat.',
        },
      });

      return { house: newHouse, survey: updatedSurvey, alreadyCreated: false };
    });
  }

  /**
   * Retrieves single photo record by ID.
   */
  static async getSurveyPhotoById(photoId: string): Promise<any> {
    return prisma.surveyPhoto.findUnique({
      where: { id: photoId },
      include: {
        survey: {
          select: {
            id: true,
            serviceOrderId: true,
            status: true,
          },
        },
      },
    });
  }
}

