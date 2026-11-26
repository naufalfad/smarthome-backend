import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { FloorPlanService } from '../services/floor-plan.service.js';
import { resolveUploadPath, streamFileSecurely } from '../utils/storage-path.util.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export async function getPlanByFloor(req: Request, res: Response, next: NextFunction) {
  try {
    const floorId = req.params.floorId as string;
    await PropertyAccessPolicy.assertCanAccessFloor(req.user, floorId, { requireActive: true });
    const plan = await FloorPlanService.getPlanByFloorId(floorId);
    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function getPlanById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, id, { requireActive: true });
    const plan = await FloorPlanService.getPlanById(id);
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Floor plan not found' });
    }
    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function updatePlanConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);
    const {
      name,
      viewBoxX,
      viewBoxY,
      viewBoxWidth,
      viewBoxHeight,
      backgroundOpacity,
      isBackgroundVisible,
      gridSnap,
    } = req.body;

    const plan = await FloorPlanService.updatePlanConfig(id, {
      ...(name !== undefined && { name }),
      ...(viewBoxX !== undefined && { viewBoxX: Number(viewBoxX) }),
      ...(viewBoxY !== undefined && { viewBoxY: Number(viewBoxY) }),
      ...(viewBoxWidth !== undefined && { viewBoxWidth: Number(viewBoxWidth) }),
      ...(viewBoxHeight !== undefined && { viewBoxHeight: Number(viewBoxHeight) }),
      ...(backgroundOpacity !== undefined && { backgroundOpacity: Number(backgroundOpacity) }),
      ...(isBackgroundVisible !== undefined && { isBackgroundVisible: Boolean(isBackgroundVisible) }),
      ...(gridSnap !== undefined && { gridSnap: Boolean(gridSnap) }),
    });

    res.json({ success: true, data: plan });
  } catch (err) {
    next(err);
  }
}

export async function uploadBackground(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }

    const plan = await FloorPlanService.setBackground(id, req.file);
    res.json({
      success: true,
      message: 'Background image uploaded successfully',
      data: plan,
    });
  } catch (err) {
    // If multer saved a file but error occurred, clean it up
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    next(err);
  }
}

export async function deleteBackground(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);
    const plan = await FloorPlanService.deleteBackground(id);
    res.json({
      success: true,
      message: 'Background image removed',
      data: plan,
    });
  } catch (err) {
    next(err);
  }
}

export async function streamBackgroundImage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, id, { requireActive: true });
    const plan = await FloorPlanService.getPlanById(id);
    if (!plan || !plan.imagePath) {
      return res.status(404).json({ success: false, message: 'No background image available for this plan' });
    }

    const absPath = resolveUploadPath(plan.imagePath);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).json({ success: false, message: 'Image file not found on storage' });
    }

    streamFileSecurely(req, res, {
      filePath: absPath,
      mimeType: plan.imageMimeType || 'image/png',
      fileName: path.basename(absPath),
    });
  } catch (err) {
    next(err);
  }
}

export async function saveCalibration(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);
    const { point1, point2, distanceMeters } = req.body;

    if (!point1 || !point2 || typeof distanceMeters !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Invalid calibration data. point1, point2, and numeric distanceMeters are required.',
      });
    }

    const plan = await FloorPlanService.saveCalibration(id, {
      point1,
      point2,
      distanceMeters,
    });

    res.json({
      success: true,
      message: 'Scale calibration saved successfully',
      data: plan,
    });
  } catch (err) {
    next(err);
  }
}

export async function resetCalibration(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);

    const plan = await FloorPlanService.resetCalibration(id);

    res.json({
      success: true,
      message: 'Scale calibration reset successfully',
      data: plan,
    });
  } catch (err) {
    next(err);
  }
}

export async function rotatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, id);

    const plan = await FloorPlanService.rotatePlan(id);

    res.json({
      success: true,
      message: 'Floor plan rotated 90 degrees successfully',
      data: plan,
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// OBJECT INSTANCES CONTROLLER
// ==========================================

export async function listObjects(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, id, { requireActive: true });
    const objects = await FloorPlanService.listObjects(id);
    res.json({ success: true, data: objects });
  } catch (err) {
    next(err);
  }
}

export async function createObject(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
    const {
      catalogObjectId,
      name,
      category,
      x,
      y,
      width,
      height,
      rotation,
      zIndex,
      roomId,
      properties,
    } = req.body;

    if (!name || typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Object name, x, and y coordinates are required.',
      });
    }

    const obj = await FloorPlanService.createObject(floorPlanId, {
      catalogObjectId,
      name,
      category: category || 'GENERAL',
      x,
      y,
      width: width ? Number(width) : undefined,
      height: height ? Number(height) : undefined,
      rotation: rotation ? Number(rotation) : 0,
      zIndex: zIndex ? Number(zIndex) : undefined,
      roomId,
      properties,
    });

    res.status(201).json({ success: true, data: obj });
  } catch (err) {
    next(err);
  }
}

export async function updateObject(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
    const objectId = req.params.objectId as string;
    const {
      name,
      category,
      x,
      y,
      width,
      height,
      rotation,
      zIndex,
      roomId,
      properties,
    } = req.body;

    const obj = await FloorPlanService.updateObject(floorPlanId, objectId, {
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(x !== undefined && { x: Number(x) }),
      ...(y !== undefined && { y: Number(y) }),
      ...(width !== undefined && { width: Number(width) }),
      ...(height !== undefined && { height: Number(height) }),
      ...(rotation !== undefined && { rotation: Number(rotation) }),
      ...(zIndex !== undefined && { zIndex: Number(zIndex) }),
      ...(roomId !== undefined && { roomId }),
      ...(properties !== undefined && { properties }),
    });

    res.json({ success: true, data: obj });
  } catch (err) {
    next(err);
  }
}

export async function deleteObject(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
    const objectId = req.params.objectId as string;
    await FloorPlanService.deleteObject(floorPlanId, objectId);
    res.json({ success: true, message: 'Object deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function duplicateObject(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
    const objectId = req.params.objectId as string;
    const copy = await FloorPlanService.duplicateObject(floorPlanId, objectId);
    res.status(201).json({ success: true, data: copy });
  } catch (err) {
    next(err);
  }
}

export async function batchUpdateObjects(req: Request, res: Response, next: NextFunction) {
  try {
    const floorPlanId = req.params.id as string;
    await PropertyAccessPolicy.assertCanEditFloorPlan(req.user, floorPlanId);
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ success: false, message: 'updates array is required' });
    }

    const results = await FloorPlanService.batchUpdateObjects(floorPlanId, updates);
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
}
