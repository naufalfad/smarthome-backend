/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - SERVICE
 * CRUD, validation, querying, and controller bridge.
 */

import { prisma } from '../services/db.service.js';
import { AutomationEngine } from './automation.engine.js';
import {
  RuleCondition,
  RuleAction,
  ConditionOperator,
  DryRunTestResult,
  AutomationEngineStatus,
} from './automation.types.js';

export interface CreateAutomationRuleDto {
  houseId?: string;
  name: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  triggerType?: string;
  triggerMode?: string;
  conditionOperator?: ConditionOperator;
  conditions: RuleCondition[];
  actions: RuleAction[];
  cooldownSeconds?: number;
}

export interface UpdateAutomationRuleDto {
  houseId?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  triggerType?: string;
  triggerMode?: string;
  conditionOperator?: ConditionOperator;
  conditions?: RuleCondition[];
  actions?: RuleAction[];
  cooldownSeconds?: number;
}

export class AutomationService {
  private static engine = AutomationEngine.getInstance();

  /**
   * Retrieves all automation rules, optionally filtered by houseId or enabled status
   */
  static async getAllRules(filters: { houseId?: string; enabled?: boolean } = {}) {
    const where: any = {};
    if (filters.houseId) {
      where.houseId = filters.houseId;
    }
    if (filters.enabled !== undefined) {
      where.enabled = filters.enabled;
    }

    return prisma.automationRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        house: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
    });
  }

  /**
   * Retrieves a single automation rule by ID with its latest executions
   */
  static async getRuleById(id: string) {
    const rule = await prisma.automationRule.findUnique({
      where: { id },
      include: {
        house: { select: { id: true, name: true } },
        executions: {
          orderBy: { startedAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!rule) {
      throw new Error(`Automation rule with id '${id}' not found`);
    }

    return rule;
  }

  /**
   * Validates and creates a new automation rule
   */
  static async createRule(data: CreateAutomationRuleDto) {
    if (!data.name || data.name.trim() === '') {
      throw new Error('Rule name is required');
    }

    if (!data.conditions || !Array.isArray(data.conditions) || data.conditions.length === 0) {
      throw new Error('At least one condition is required');
    }

    if (!data.actions || !Array.isArray(data.actions) || data.actions.length === 0) {
      throw new Error('At least one action is required');
    }

    // Auto-detect triggerType if not provided
    let triggerType = data.triggerType;
    if (!triggerType) {
      const types = new Set(data.conditions.map((c) => c.type));
      if (types.has('TIME') || types.has('SCHEDULE')) {
        triggerType = types.size > 1 ? 'HYBRID' : 'SCHEDULED';
      } else if (types.has('SENSOR') && types.has('DEVICE_STATE')) {
        triggerType = 'HYBRID';
      } else if (types.has('SENSOR')) {
        triggerType = 'SENSOR';
      } else {
        triggerType = 'DEVICE_STATE';
      }
    }

    return prisma.automationRule.create({
      data: {
        houseId: data.houseId || null,
        name: data.name.trim(),
        description: data.description || null,
        enabled: data.enabled !== undefined ? data.enabled : true,
        priority: Number(data.priority) || 0,
        triggerType,
        triggerMode: data.triggerMode || 'WHEN_CONDITION_BECOMES_TRUE',
        conditionOperator: data.conditionOperator || 'ALL',
        conditions: data.conditions as any,
        actions: data.actions as any,
        cooldownSeconds: data.cooldownSeconds !== undefined ? Math.max(0, Number(data.cooldownSeconds)) : 60,
      },
    });
  }

  /**
   * Updates an existing automation rule
   */
  static async updateRule(id: string, data: UpdateAutomationRuleDto) {
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Automation rule with id '${id}' not found`);
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.priority !== undefined) updateData.priority = Number(data.priority);
    if (data.triggerType !== undefined) updateData.triggerType = data.triggerType;
    if (data.triggerMode !== undefined) updateData.triggerMode = data.triggerMode;
    if (data.conditionOperator !== undefined) updateData.conditionOperator = data.conditionOperator;
    if (data.conditions !== undefined) {
      if (!Array.isArray(data.conditions) || data.conditions.length === 0) {
        throw new Error('Conditions must be a non-empty array');
      }
      updateData.conditions = data.conditions;
    }
    if (data.actions !== undefined) {
      if (!Array.isArray(data.actions) || data.actions.length === 0) {
        throw new Error('Actions must be a non-empty array');
      }
      updateData.actions = data.actions;
    }
    if (data.cooldownSeconds !== undefined) {
      updateData.cooldownSeconds = Math.max(0, Number(data.cooldownSeconds));
    }
    if (data.houseId !== undefined) updateData.houseId = data.houseId;

    return prisma.automationRule.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Deletes an automation rule and its cascade executions
   */
  static async deleteRule(id: string) {
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Automation rule with id '${id}' not found`);
    }

    return prisma.automationRule.delete({
      where: { id },
    });
  }

  /**
   * Toggles rule enabled state
   */
  static async toggleRule(id: string, enabled?: boolean) {
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Automation rule with id '${id}' not found`);
    }

    const targetEnabled = enabled !== undefined ? enabled : !existing.enabled;

    return prisma.automationRule.update({
      where: { id },
      data: { enabled: targetEnabled },
    });
  }

  /**
   * Performs a dry-run test on an existing rule
   */
  static async testRule(id: string): Promise<DryRunTestResult> {
    const rule = await this.getRuleById(id);
    return this.engine.evaluateDryRun({
      name: rule.name,
      conditions: rule.conditions as unknown as RuleCondition[],
      conditionOperator: rule.conditionOperator as ConditionOperator,
      actions: rule.actions as unknown as RuleAction[],
    });
  }

  /**
   * Performs a dry-run test on an unsaved draft rule
   */
  static async testDraftRule(draft: {
    name?: string;
    conditions: RuleCondition[];
    conditionOperator?: ConditionOperator;
    actions: RuleAction[];
  }): Promise<DryRunTestResult> {
    return this.engine.evaluateDryRun(draft);
  }

  /**
   * Fetches paginated execution history for a specific rule
   */
  static async getRuleExecutions(ruleId: string, limit: number = 20, offset: number = 0) {
    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where: { ruleId },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.automationExecution.count({ where: { ruleId } }),
    ]);

    return {
      total,
      limit,
      offset,
      executions,
    };
  }

  /**
   * Fetches paginated execution history across all rules
   * Supports filtering by status, specific ruleId, or property houseId(s)
   */
  static async getAllExecutions(filters: {
    limit?: number;
    offset?: number;
    status?: string;
    houseId?: string | string[];
    ruleId?: string;
  } = {}) {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.ruleId) {
      where.ruleId = filters.ruleId;
    }

    if (filters.houseId) {
      if (Array.isArray(filters.houseId)) {
        where.rule = { houseId: { in: filters.houseId } };
      } else {
        where.rule = { houseId: filters.houseId };
      }
    }

    const [executions, total] = await Promise.all([
      prisma.automationExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          rule: {
            select: { id: true, name: true, houseId: true, triggerType: true, priority: true },
          },
        },
      }),
      prisma.automationExecution.count({ where }),
    ]);

    return {
      total,
      limit,
      offset,
      executions,
    };
  }

  /**
   * Gets engine status
   */
  static async getEngineStatus(): Promise<AutomationEngineStatus> {
    return this.engine.getStatus();
  }

  /**
   * Triggers an immediate evaluation cycle manually
   */
  static async triggerEvaluationCycle() {
    return this.engine.evaluateCycle();
  }
}

