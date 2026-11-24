import { Request, Response } from 'express';
import { houseModelService } from '../services/house-model.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { streamFileSecurely, resolveUploadPath } from '../utils/storage-path.util.js';
import path from 'path';
import fs from 'fs';

const getParamId = (req: Request): string => {
  const { id } = req.params;
  return Array.isArray(id) ? id[0] : (id as string);
};

export const getHouseModels = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, status } = req.query;
    const result = await houseModelService.listHouseModels({
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 12,
      search: search as string,
      status: status as any,
    });
    return sendSuccess(res, 'House models retrieved successfully', result);
  } catch (err: any) {
    return sendError(res, err?.message || 'Failed to list house models', err, 500);
  }
};

export const getHouseModelById = async (req: Request, res: Response) => {
  try {
    const id = getParamId(req);
    const model = await houseModelService.getHouseModelById(id);
    if (!model) {
      return sendError(res, `House model with ID '${id}' not found`, null, 404);
    }
    return sendSuccess(res, 'House model retrieved successfully', model);
  } catch (err: any) {
    return sendError(res, err?.message || 'Failed to get house model', err, 500);
  }
};

export const createHouseModel = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const file = req.file;

    if (!name || !name.trim()) {
      if (file && fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path);
      }
      return sendError(res, 'Model name is required', null, 400);
    }

    if (!file) {
      return sendError(res, 'GLB file is required', null, 400);
    }

    const created = await houseModelService.createHouseModel({
      name,
      description,
      file,
    });

    return sendSuccess(res, '3D House Model uploaded and inspected successfully', created, 201);
  } catch (err: any) {
    return sendError(res, err?.message || 'Failed to upload house model', err, 400);
  }
};

export const updateHouseModel = async (req: Request, res: Response) => {
  try {
    const id = getParamId(req);
    const { name, description, status } = req.body;

    const updated = await houseModelService.updateHouseModel(id, {
      name,
      description,
      status,
    });

    return sendSuccess(res, 'House model updated successfully', updated);
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 400;
    return sendError(res, err?.message || 'Failed to update house model', err, status);
  }
};

export const deleteHouseModel = async (req: Request, res: Response) => {
  try {
    const id = getParamId(req);
    const result = await houseModelService.deleteHouseModel(id);
    return sendSuccess(res, 'House model and associated files deleted successfully', result);
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 500;
    return sendError(res, err?.message || 'Failed to delete house model', err, status);
  }
};

export const getModelInspection = async (req: Request, res: Response) => {
  try {
    const id = getParamId(req);
    const model = await houseModelService.getHouseModelById(id);
    if (!model) {
      return sendError(res, `House model with ID '${id}' not found`, null, 404);
    }

    if (!model.modelMetadata) {
      const result = await houseModelService.inspectHouseModel(id);
      return sendSuccess(res, 'Model inspection performed successfully', result.inspection);
    }

    return sendSuccess(res, 'Model inspection metadata retrieved', model.modelMetadata);
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 500;
    return sendError(res, err?.message || 'Failed to retrieve model inspection', err, status);
  }
};

export const inspectHouseModel = async (req: Request, res: Response) => {
  try {
    const id = getParamId(req);
    const result = await houseModelService.inspectHouseModel(id);
    return sendSuccess(res, 'Model re-inspected successfully', result);
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 500;
    return sendError(res, err?.message || 'Failed to re-inspect model', err, status);
  }
};

export const streamModelFile = async (req: Request, res: Response) => {
  try {
    // 1. Mandatory role check: Legacy 3D Studio models are internal administrative assets
    if (req.user?.role !== 'SUPER_ADMIN') {
      return sendError(
        res,
        'Akses dilarang: Model 3D studio bersifat administratif dan hanya dapat diakses oleh Super Admin.',
        null,
        403
      );
    }

    const id = getParamId(req);
    const { absolutePath, fileName, mimeType, fileSize } =
      await houseModelService.getModelFilePath(id);

    return streamFileSecurely(req, res, {
      filePath: absolutePath,
      fileName,
      mimeType,
      fileSize,
      allowByteRange: true,
      maxAgeSeconds: 86400,
    });
  } catch (err: any) {
    const status = err?.message?.includes('not found') || err?.message?.includes('does not exist')
      ? 404
      : err?.message?.includes('Access denied')
      ? 403
      : 500;
    return sendError(res, err?.message || 'Failed to stream GLB model file', err, status);
  }
};

export const streamModelThumbnail = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return sendError(
        res,
        'Akses dilarang: Model 3D studio bersifat administratif dan hanya dapat diakses oleh Super Admin.',
        null,
        403
      );
    }

    const id = getParamId(req);
    const model = await houseModelService.getHouseModelById(id);
    if (!model || !model.thumbnailPath) {
      return sendError(res, 'Thumbnail not found for this house model', null, 404);
    }

    const absPath = resolveUploadPath(model.thumbnailPath);
    if (!absPath || !fs.existsSync(absPath)) {
      return sendError(res, 'Thumbnail file not found on storage', null, 404);
    }

    const ext = path.extname(absPath).toLowerCase();
    const mimeType = ext === '.webp' ? 'image/webp' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    return streamFileSecurely(req, res, {
      filePath: absPath,
      fileName: path.basename(absPath),
      mimeType,
      maxAgeSeconds: 86400,
    });
  } catch (err: any) {
    const status = err?.message?.includes('not found') ? 404 : 500;
    return sendError(res, err?.message || 'Failed to stream thumbnail', err, status);
  }
};
