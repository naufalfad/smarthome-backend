/**
 * PHASE 9: COMMERCIAL FIELD SURVEY CONTROLLER
 *
 * Implements HTTP request handlers for technician survey operations,
 * Super Admin review & verification, and secure internal survey photo streaming.
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { FieldSurveyService } from '../services/field-survey.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { resolveUploadPath, streamFileSecurely } from '../utils/storage-path.util.js';
import { SurveyPhotoCategory } from '@prisma/client';

/**
 * Technician: Get or initialize field survey draft for an assigned order.
 * GET /api/technician/assignments/:assignmentId/survey
 */
export async function getOrCreateSurvey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId } = req.params;
    const survey = await FieldSurveyService.getOrCreateSurvey(
      technicianProfileId,
      assignmentId as string
    );

    sendSuccess(res, 'Draf survei lapangan berhasil dimuat.', survey);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Save or update field survey draft (building, electrical, network, rooms).
 * PUT /api/technician/assignments/:assignmentId/survey
 */
export async function saveSurveyDraft(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId } = req.params;
    const input = req.body;

    const updated = await FieldSurveyService.saveSurveyDraft(
      technicianProfileId,
      assignmentId as string,
      input
    );

    sendSuccess(res, 'Draf survei berhasil disimpan.', updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Schedule survey on-site visit date.
 * PATCH /api/technician/assignments/:assignmentId/survey/schedule
 */
export async function scheduleSurveyVisit(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId } = req.params;
    const { scheduledDate } = req.body;

    if (!scheduledDate) {
      throw new AppError('Parameter scheduledDate wajib disertakan.', 400);
    }

    const updated = await FieldSurveyService.scheduleSurveyVisit(
      technicianProfileId,
      assignmentId as string,
      scheduledDate
    );

    sendSuccess(res, 'Jadwal survei lapangan berhasil diperbarui.', updated);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Upload internal documentation photograph for field survey.
 * POST /api/technician/assignments/:assignmentId/survey/photos
 */
export async function uploadSurveyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId } = req.params;
    const file = req.file;

    if (!file) {
      throw new AppError('Berkas foto survei wajib diunggah.', 400);
    }

    const { category, title, caption } = req.body;

    const photo = await FieldSurveyService.uploadSurveyPhoto(
      technicianProfileId,
      assignmentId as string,
      file,
      category as SurveyPhotoCategory,
      title,
      caption
    );

    sendSuccess(res, 'Foto survei berhasil diunggah.', photo, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Delete survey photograph.
 * DELETE /api/technician/assignments/:assignmentId/survey/photos/:photoId
 */
export async function deleteSurveyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId, photoId } = req.params;

    await FieldSurveyService.deleteSurveyPhoto(
      technicianProfileId,
      assignmentId as string,
      photoId as string
    );

    sendSuccess(res, 'Foto survei berhasil dihapus.', null);
  } catch (err) {
    next(err);
  }
}

/**
 * Technician: Submit completed field survey for Super Admin verification.
 * POST /api/technician/assignments/:assignmentId/survey/submit
 */
export async function submitSurvey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const technicianProfileId = req.user?.technicianProfileId;
    if (!technicianProfileId) {
      throw new AppError('Akses dilarang: Profil teknisi tidak ditemukan.', 403);
    }

    const { assignmentId } = req.params;

    const submitted = await FieldSurveyService.submitSurvey(
      technicianProfileId,
      assignmentId as string
    );

    sendSuccess(res, 'Survei lapangan berhasil diajukan untuk verifikasi.', submitted);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Get complete survey details for a ServiceOrder.
 * GET /api/service-orders/admin/:id/survey
 */
export async function getSurveyForAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderId = req.params.id as string;
    const survey = await FieldSurveyService.getSurveyForAdmin(orderId);

    sendSuccess(res, 'Data survei lapangan berhasil diambil.', survey);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Request revision on a submitted survey.
 * POST /api/service-orders/admin/:id/survey/request-revision
 */
export async function requestSurveyRevision(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const orderId = req.params.id as string;
    const { revisionReason, adminNotes } = req.body;

    const result = await FieldSurveyService.requestSurveyRevision(
      adminUserId,
      orderId,
      revisionReason,
      adminNotes
    );

    sendSuccess(res, 'Permintaan revisi survei berhasil dikirim ke teknisi.', result);
  } catch (err) {
    next(err);
  }
}

/**
 * Super Admin: Verify survey and atomically create canonical House entity.
 * POST /api/service-orders/admin/:id/survey/verify
 */
export async function verifySurveyAndCreateHouse(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const adminUserId = req.user!.userId;
    const orderId = req.params.id as string;
    const { adminNotes } = req.body;

    const result = await FieldSurveyService.verifySurveyAndCreateHouse(
      adminUserId,
      orderId,
      adminNotes
    );

    const message = result.alreadyCreated
      ? 'Properti telah dibuat sebelumnya (idempoten).'
      : 'Survei berhasil diverifikasi dan properti berhasil dibuat.';

    sendSuccess(res, message, result, result.alreadyCreated ? 200 : 201);
  } catch (err) {
    next(err);
  }
}

/**
 * Secure Photo Streaming: Stream internal survey photograph.
 * GET /api/surveys/:surveyId/photos/:photoId
 * GET /api/surveys/photos/:photoId
 *
 * Strict multi-tenant security barrier:
 * - Customer: HTTP 403 Forbidden
 * - Technician: Live DB check for active assignment to the order
 * - Super Admin: Authorized
 */
export async function streamSurveyPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { photoId } = req.params;

    const photo = await FieldSurveyService.getSurveyPhotoById(photoId as string);
    if (!photo) {
      throw new AppError('Foto survei tidak ditemukan.', 404);
    }

    // Enforce multi-tenant access barrier (Customer denied, Technician active assignment checked)
    await PropertyAccessPolicy.assertCanAccessOrderSurvey(
      req.user,
      photo.survey.serviceOrderId
    );

    const absolutePath = resolveUploadPath(photo.filePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      throw new AppError('Berkas foto survei tidak ditemukan pada penyimpanan server.', 404);
    }

    streamFileSecurely(req, res, {
      filePath: absolutePath,
      mimeType: photo.mimeType || 'image/jpeg',
      fileName: photo.fileName,
      fileSize: photo.fileSize,
      maxAgeSeconds: 86400,
    });
  } catch (err) {
    next(err);
  }
}
