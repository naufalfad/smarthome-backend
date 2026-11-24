import { Request, Response } from 'express';
import { nodeIdentificationService } from '../services/node-identification.service.js';
import { sendSuccess, sendError } from '../utils/response.js';

function getParam(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

/**
 * GET /api/house-models/:id/identifications/overview
 */
export async function getIdentificationsOverview(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const overview = await nodeIdentificationService.getIdentificationsOverview(houseModelId);
    return sendSuccess(res, 'Identification overview retrieved successfully', overview);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to retrieve overview', error, 500);
  }
}

/**
 * GET /api/house-models/:id/identifications/tree
 */
export async function getIdentificationTree(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const tree = await nodeIdentificationService.getIdentificationTree(houseModelId);
    return sendSuccess(res, 'Identification tree retrieved successfully', tree);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to retrieve tree', error, 500);
  }
}

/**
 * GET /api/house-models/:id/identifications
 */
export async function getIdentifications(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const { nodeType, status, parentRoom, parentFloor, search } = req.query;

    const identifications = await nodeIdentificationService.getIdentifications(houseModelId, {
      nodeType: nodeType as any,
      status: status as any,
      parentRoom: parentRoom as string,
      parentFloor: parentFloor as string,
      search: search as string,
    });

    return sendSuccess(res, 'Identifications retrieved successfully', identifications);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to retrieve identifications', error, 500);
  }
}

/**
 * GET /api/house-models/:id/identifications/:nodeName
 */
export async function getIdentificationByNode(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const nodeName = getParam(req, 'nodeName');
    const record = await nodeIdentificationService.getIdentificationByNode(houseModelId, nodeName);
    return sendSuccess(res, 'Node identification retrieved successfully', record);
  } catch (error: any) {
    return sendError(res, error?.message || 'Node identification not found', error, 404);
  }
}

/**
 * POST /api/house-models/:id/identifications
 */
export async function upsertIdentification(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const { nodeName, displayName, category, description, status } = req.body;

    if (!nodeName || !category) {
      return sendError(res, 'nodeName and category are required fields.', null, 400);
    }

    const updated = await nodeIdentificationService.upsertIdentification(houseModelId, {
      nodeName,
      displayName,
      category,
      description,
      status,
    });

    return sendSuccess(res, 'Node identification saved successfully', updated, 200);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to save identification', error, 400);
  }
}

/**
 * PATCH /api/house-models/:id/identifications/:nodeName
 */
export async function patchIdentification(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const nodeName = getParam(req, 'nodeName');
    const { displayName, category, description, status } = req.body;

    const updated = await nodeIdentificationService.upsertIdentification(houseModelId, {
      nodeName,
      displayName,
      category,
      description,
      status,
    });

    return sendSuccess(res, 'Node identification updated successfully', updated);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to update identification', error, 400);
  }
}

/**
 * POST /api/house-models/:id/identifications/bulk
 */
export async function bulkUpdateIdentifications(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const result = await nodeIdentificationService.bulkUpdateIdentifications(houseModelId, req.body);
    return sendSuccess(res, 'Bulk identification operation completed successfully', result);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to process bulk identification', error, 400);
  }
}

/**
 * POST /api/house-models/:id/identifications/revalidate
 */
export async function revalidateIdentifications(req: Request, res: Response) {
  try {
    const houseModelId = getParam(req, 'id');
    const report = await nodeIdentificationService.revalidateIdentifications(houseModelId);
    return sendSuccess(res, 'GLB revalidation against identifications completed successfully', report);
  } catch (error: any) {
    return sendError(res, error?.message || 'Failed to revalidate GLB against identifications', error, 500);
  }
}
