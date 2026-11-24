/**
 * PHASE 4: EXPRESS MIDDLEWARE FOR PROPERTY ACCESS ENFORCEMENT
 */

import { Request, Response, NextFunction } from 'express';
import { PropertyAccessPolicy, PropertyAccessOptions } from '../services/property-access-policy.service.js';
import { AppError } from './error.middleware.js';

/**
 * Middleware that validates access to a House by parameter name.
 */
export function requirePropertyAccess(
  paramKey: string = 'id',
  options?: PropertyAccessOptions & { source?: 'params' | 'query' | 'body' }
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const source = options?.source || 'params';
      let houseId: string | undefined;

      if (source === 'params') {
        const rawParam = req.params[paramKey];
        houseId = Array.isArray(rawParam) ? rawParam[0] : (rawParam as string | undefined);
      } else if (source === 'query') {
        const rawQuery = req.query[paramKey];
        houseId = Array.isArray(rawQuery) ? (rawQuery[0] as string) : (rawQuery as string | undefined);
      } else {
        houseId = req.body?.[paramKey];
      }

      if (!houseId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessProperty(req.user, houseId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that validates access to a Device by parameter name.
 */
export function requireDeviceAccess(
  paramKey: string = 'id',
  options?: PropertyAccessOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramKey];
      const deviceId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
      if (!deviceId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessDevice(req.user, deviceId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that validates access to a FloorPlan by parameter name.
 */
export function requireFloorPlanAccess(
  paramKey: string = 'id',
  options?: PropertyAccessOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramKey];
      const floorPlanId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
      if (!floorPlanId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessFloorPlan(req.user, floorPlanId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that validates access to a Floor by parameter name.
 */
export function requireFloorAccess(
  paramKey: string = 'floorId',
  options?: PropertyAccessOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramKey];
      const floorId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
      if (!floorId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessFloor(req.user, floorId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that validates access to a Room by parameter name.
 */
export function requireRoomAccess(
  paramKey: string = 'id',
  options?: PropertyAccessOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramKey];
      const roomId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
      if (!roomId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessRoom(req.user, roomId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware that validates access to an AutomationRule by parameter name.
 */
export function requireAutomationRuleAccess(
  paramKey: string = 'id',
  options?: PropertyAccessOptions
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.params[paramKey];
      const ruleId = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
      if (!ruleId) {
        throw new AppError(`Parameter '${paramKey}' wajib disertakan.`, 400);
      }

      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, ruleId, options);
      next();
    } catch (err) {
      next(err);
    }
  };
}

