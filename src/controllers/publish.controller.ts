import { Request, Response, NextFunction } from 'express';
import { PublishService } from '../services/publish.service.js';

export async function getPublishStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    const status = await PublishService.getPublishStatus(houseId);
    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
}

export async function publishHouse(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    const result = await PublishService.publishHouse(houseId);
    res.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function previewHouse(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    const result = await PublishService.previewHouse(houseId);
    res.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

export async function unpublishHouse(req: Request, res: Response, next: NextFunction) {
  try {
    const houseId = req.params.houseId as string;
    const result = await PublishService.unpublishHouse(houseId);
    res.json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
