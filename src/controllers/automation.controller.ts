/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - CONTROLLER
 * Express controller handling REST endpoints for automation rules and executions.
 * Hardened in Phase 4 for multi-tenant isolation, state-gating, and cross-property injection prevention.
 */

import { Request, Response } from 'express';
import { AutomationService } from '../automation/automation.service.js';
import { PropertyAccessPolicy } from '../services/property-access-policy.service.js';
import { AppError } from '../middlewares/error.middleware.js';
import { prisma } from '../services/db.service.js';

export class AutomationController {
  /**
   * GET /api/automations
   */
  static async getRules(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.role) {
        throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
      }

      const { houseId, enabled } = req.query;
      const isEnabled = enabled !== undefined ? enabled === 'true' : undefined;

      if (user.role === 'SUPER_ADMIN') {
        const rules = await AutomationService.getAllRules({
          houseId: houseId as string | undefined,
          enabled: isEnabled,
        });
        return res.status(200).json({ success: true, data: rules });
      }

      if (user.role === 'CUSTOMER') {
        if (!user.customerProfileId) {
          throw new AppError('Akses dilarang: Profil pelanggan tidak ditemukan.', 403);
        }

        if (houseId) {
          await PropertyAccessPolicy.assertCanAccessProperty(user, houseId as string, {
            requireActive: true,
          });
          const rules = await AutomationService.getAllRules({
            houseId: houseId as string,
            enabled: isEnabled,
          });
          return res.status(200).json({ success: true, data: rules });
        }

        // If houseId omitted, find Customer's active properties only
        const activeHouses = await prisma.house.findMany({
          where: { customerId: user.customerProfileId, setupStatus: 'ACTIVE' },
          select: { id: true },
        });

        if (activeHouses.length === 0) {
          return res.status(200).json({ success: true, data: [] });
        }

        const activeHouseIds = activeHouses.map((h) => h.id);
        const rules = await prisma.automationRule.findMany({
          where: {
            houseId: { in: activeHouseIds },
            ...(isEnabled !== undefined && { enabled: isEnabled }),
          },
          orderBy: [{ enabled: 'desc' }, { priority: 'desc' }, { name: 'asc' }],
        });

        return res.status(200).json({ success: true, data: rules });
      }

      // TECHNICIAN: currently no active assignments
      return res.status(200).json({ success: true, data: [] });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to fetch automation rules',
      });
    }
  }

  /**
   * GET /api/automations/:id
   */
  static async getRuleById(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      const rule = await AutomationService.getRuleById(id);
      return res.status(200).json({
        success: true,
        data: rule,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : err.message.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * POST /api/automations
   */
  static async createRule(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.role) {
        throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
      }

      const { houseId, conditions, actions } = req.body;

      if (user.role === 'CUSTOMER') {
        if (!houseId) {
          throw new AppError("Parameter 'houseId' wajib disertakan.", 400);
        }

        await PropertyAccessPolicy.assertCanAccessProperty(user, houseId, {
          requireActive: true,
        });

        // Anti-cross-property resource injection verification
        const deviceIds = new Set<string>();
        if (Array.isArray(conditions)) {
          conditions.forEach((c: any) => {
            if (c.deviceId) deviceIds.add(c.deviceId);
          });
        }
        if (Array.isArray(actions)) {
          actions.forEach((a: any) => {
            if (a.deviceId) deviceIds.add(a.deviceId);
          });
        }

        if (deviceIds.size > 0) {
          const matching = await prisma.device.findMany({
            where: { id: { in: Array.from(deviceIds) }, houseId },
            select: { id: true },
          });
          const matchSet = new Set(matching.map((d) => d.id));
          for (const devId of deviceIds) {
            if (!matchSet.has(devId)) {
              throw new AppError(
                `Injeksi ditolak: Perangkat '${devId}' tidak terdaftar pada properti ini.`,
                400
              );
            }
          }
        }
      } else if (user.role === 'TECHNICIAN') {
        throw new AppError(
          'Akses dilarang: Teknisi belum memiliki penugasan aktif untuk membuat aturan otomasi.',
          403
        );
      }

      const rule = await AutomationService.createRule(req.body);
      return res.status(201).json({
        success: true,
        data: rule,
        message: 'Automation rule created successfully',
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 400;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to create automation rule',
      });
    }
  }

  /**
   * PUT /api/automations/:id
   */
  static async updateRule(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      const updated = await AutomationService.updateRule(id, req.body);
      return res.status(200).json({
        success: true,
        data: updated,
        message: 'Automation rule updated successfully',
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : err.message.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to update automation rule',
      });
    }
  }

  /**
   * DELETE /api/automations/:id
   */
  static async deleteRule(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      await AutomationService.deleteRule(id);
      return res.status(200).json({
        success: true,
        message: 'Automation rule deleted successfully',
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : err.message.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to delete automation rule',
      });
    }
  }

  /**
   * PATCH /api/automations/:id/toggle
   */
  static async toggleRule(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      const { enabled } = req.body;
      const updated = await AutomationService.toggleRule(id, enabled);
      return res.status(200).json({
        success: true,
        data: updated,
        message: `Automation rule ${updated.enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : err.message.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to toggle automation rule',
      });
    }
  }

  /**
   * POST /api/automations/:id/test
   */
  static async testRule(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      const testResult = await AutomationService.testRule(id);
      return res.status(200).json({
        success: true,
        data: testResult,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : err.message.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Dry run test failed',
      });
    }
  }

  /**
   * POST /api/automations/test (Test draft rule before saving)
   */
  static async testDraftRule(req: Request, res: Response) {
    try {
      if (req.body?.houseId) {
        await PropertyAccessPolicy.assertCanAccessProperty(req.user, req.body.houseId, {
          requireActive: true,
        });
      }
      const testResult = await AutomationService.testDraftRule(req.body);
      return res.status(200).json({
        success: true,
        data: testResult,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 400;
      return res.status(status).json({
        success: false,
        error: err.message || 'Draft test failed',
      });
    }
  }

  /**
   * GET /api/automations/:id/executions
   */
  static async getRuleExecutions(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      await PropertyAccessPolicy.assertCanAccessAutomationRule(req.user, id, {
        requireActive: true,
      });

      const limit = parseInt(req.query.limit as string, 10) || 20;
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const result = await AutomationService.getRuleExecutions(id, limit, offset);
      return res.status(200).json({
        success: true,
        data: result.executions,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to fetch rule executions',
      });
    }
  }

  /**
   * GET /api/automation-executions
   * 1. SUPER_ADMIN: Global execution history across platform, or optionally filtered by houseId.
   * 2. CUSTOMER: Execution history strictly scoped to their own ACTIVE properties.
   *    Never exposes global execution records or inactive/foreign properties to Customer.
   * 3. TECHNICIAN: Denied until Phase 8 assignment engine.
   */
  static async getAllExecutions(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || !user.role) {
        throw new AppError('Akses ditolak: Autentikasi diperlukan.', 401);
      }

      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const status = req.query.status as string | undefined;
      const requestedHouseId = typeof req.query.houseId === 'string' && req.query.houseId.trim()
        ? req.query.houseId.trim()
        : undefined;

      // 1. SUPER_ADMIN: Unrestricted global execution history or filtered by houseId
      if (user.role === 'SUPER_ADMIN') {
        const result = await AutomationService.getAllExecutions({
          limit,
          offset,
          status,
          houseId: requestedHouseId,
        });
        return res.status(200).json({
          success: true,
          data: result.executions,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
          },
        });
      }

      // 2. CUSTOMER: Scoped strictly to own ACTIVE properties
      if (user.role === 'CUSTOMER') {
        if (!user.customerProfileId) {
          throw new AppError('Akses dilarang: Profil pelanggan tidak ditemukan.', 403);
        }

        let targetHouseIds: string[] = [];

        if (requestedHouseId) {
          // Explicit houseId requested: verify ownership and state ACTIVE
          await PropertyAccessPolicy.assertCanAccessProperty(user, requestedHouseId, {
            requireActive: true,
          });
          targetHouseIds = [requestedHouseId];
        } else {
          // No houseId requested: find all ACTIVE houses belonging to this customer
          const customerActiveHouses = await prisma.house.findMany({
            where: {
              customerId: user.customerProfileId,
              setupStatus: 'ACTIVE',
            },
            select: { id: true },
          });

          if (customerActiveHouses.length === 0) {
            return res.status(200).json({
              success: true,
              data: [],
              pagination: { total: 0, limit, offset },
            });
          }

          targetHouseIds = customerActiveHouses.map((h) => h.id);
        }

        const result = await AutomationService.getAllExecutions({
          limit,
          offset,
          status,
          houseId: targetHouseIds.length === 1 ? targetHouseIds[0] : targetHouseIds,
        });

        return res.status(200).json({
          success: true,
          data: result.executions,
          pagination: {
            total: result.total,
            limit: result.limit,
            offset: result.offset,
          },
        });
      }

      // 3. TECHNICIAN: Deny until Phase 8 assignment engine
      throw new AppError(
        'Akses dilarang: Teknisi belum memiliki akses ke riwayat eksekusi otomasi platform.',
        403
      );
    } catch (err: any) {
      const statusCode = err instanceof AppError ? err.statusCode : 500;
      return res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to fetch automation executions',
      });
    }
  }

  /**
   * GET /api/automation/status
   */
  static async getEngineStatus(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'SUPER_ADMIN') {
        throw new AppError('Akses dilarang: Hanya Super Admin yang dapat melihat status mesin otomasi.', 403);
      }
      const status = await AutomationService.getEngineStatus();
      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to fetch engine status',
      });
    }
  }

  /**
   * POST /api/automation/evaluate (Manually trigger evaluation cycle)
   */
  static async triggerEvaluation(req: Request, res: Response) {
    try {
      if (req.user?.role !== 'SUPER_ADMIN') {
        throw new AppError('Akses dilarang: Hanya Super Admin yang dapat memicu evaluasi otomasi.', 403);
      }
      const result = await AutomationService.triggerEvaluationCycle();
      return res.status(200).json({
        success: true,
        data: result,
        message: 'Evaluation cycle completed',
      });
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      return res.status(status).json({
        success: false,
        error: err.message || 'Failed to trigger evaluation cycle',
      });
    }
  }
}
