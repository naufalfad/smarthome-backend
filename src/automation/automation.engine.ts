/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - CORE ENGINE
 * Autonomous background engine managing rule evaluation, cooldowns, conflict resolution,
 * anti-loop protection, execution logging, and crash recovery.
 */

import { prisma } from '../services/db.service.js';
import {
  RuleCondition,
  RuleAction,
  ConditionOperator,
  AutomationEngineStatus,
  RuleEvaluationResult,
  DryRunTestResult,
} from './automation.types.js';
import { AutomationEvaluator } from './automation.evaluator.js';
import { AutomationActionRunner } from './automation.action-runner.js';

interface DeviceTriggerRecord {
  timestamp: number;
}

export class AutomationEngine {
  private static instance: AutomationEngine | null = null;
  private isRunning: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number = 5000; // Evaluates every 5 seconds
  private cycleCount: number = 0;
  private lastCycleAt: Date | null = null;
  private lastCycleDurationMs: number = 0;
  private isEvaluating: boolean = false;

  // In-memory state tracking for edge triggering (WHEN_CONDITION_BECOMES_TRUE)
  private rulePreviousMetState: Map<string, boolean> = new Map();

  // In-memory rolling window for anti-loop protection (deviceId -> timestamps)
  private deviceTriggerHistory: Map<string, DeviceTriggerRecord[]> = new Map();
  private readonly MAX_TRIGGERS_PER_WINDOW = 5;
  private readonly TRIGGER_WINDOW_MS = 30000; // 30 seconds

  private constructor() {
    const envInterval = process.env.AUTOMATION_INTERVAL_MS;
    if (envInterval) {
      const parsed = parseInt(envInterval, 10);
      if (!isNaN(parsed) && parsed >= 1000) {
        this.intervalMs = parsed;
      }
    }
    this.setupGracefulShutdown();
  }

  public static getInstance(): AutomationEngine {
    if (!AutomationEngine.instance) {
      AutomationEngine.instance = new AutomationEngine();
    }
    return AutomationEngine.instance;
  }

  private setupGracefulShutdown(): void {
    const handleShutdown = (signal: string) => {
      console.log(`\n🛑 [AutomationEngine] Received ${signal}. Shutting down automation engine...`);
      this.stop();
    };

    process.once('SIGINT', () => handleShutdown('SIGINT'));
    process.once('SIGTERM', () => handleShutdown('SIGTERM'));
  }

  /**
   * Starts the autonomous background evaluation worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`⚡ [AutomationEngine] Starting background worker (interval: ${this.intervalMs}ms)...`);

    // 1. Recover dangling PROCESSING executions from prior crashes or restarts
    await this.recoverDanglingExecutions();

    // 2. Schedule evaluation loop
    this.timer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.evaluateCycle();
      } catch (err: any) {
        console.error('❌ [AutomationEngine] Unhandled error during evaluation cycle:', err);
      }
    }, this.intervalMs);
  }

  /**
   * Stops the evaluation worker
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('🛑 [AutomationEngine] Background worker stopped.');
  }

  /**
   * Recovers dangling executions that were left in PROCESSING state when server crashed or restarted
   */
  public async recoverDanglingExecutions(): Promise<number> {
    try {
      const dangling = await prisma.automationExecution.updateMany({
        where: { status: 'PROCESSING' },
        data: {
          status: 'FAILED',
          errorMessage: 'Server restarted while execution was processing',
          completedAt: new Date(),
        },
      });

      if (dangling.count > 0) {
        console.log(`🔧 [AutomationEngine] Recovered ${dangling.count} dangling execution(s) to FAILED.`);
      }
      return dangling.count;
    } catch (err: any) {
      console.warn('⚠️ [AutomationEngine] Error during dangling execution recovery:', err.message);
      return 0;
    }
  }

  /**
   * Returns runtime statistics of the automation engine
   */
  public async getStatus(): Promise<AutomationEngineStatus> {
    const activeRulesCount = await prisma.automationRule.count({
      where: { enabled: true },
    });

    const totalExecutionsCount = await prisma.automationExecution.count();

    const now = Date.now();
    let cooldownActiveRules = 0;

    const rules = await prisma.automationRule.findMany({
      where: { enabled: true, lastTriggeredAt: { not: null } },
      select: { lastTriggeredAt: true, cooldownSeconds: true },
    });

    for (const r of rules) {
      if (r.lastTriggeredAt) {
        const elapsedSec = (now - r.lastTriggeredAt.getTime()) / 1000;
        if (elapsedSec < r.cooldownSeconds) {
          cooldownActiveRules++;
        }
      }
    }

    return {
      isRunning: this.isRunning,
      cycleCount: this.cycleCount,
      lastCycleAt: this.lastCycleAt ? this.lastCycleAt.toISOString() : null,
      lastCycleDurationMs: this.lastCycleDurationMs,
      activeRulesCount,
      totalExecutionsCount,
      cooldownActiveRules,
    };
  }

  /**
   * Main evaluation cycle: evaluates all enabled rules against current device states
   */
  public async evaluateCycle(): Promise<{
    evaluatedCount: number;
    triggeredCount: number;
    skippedCount: number;
    errors: string[];
  }> {
    if (this.isEvaluating) {
      return { evaluatedCount: 0, triggeredCount: 0, skippedCount: 0, errors: ['Cycle already in progress'] };
    }

    this.isEvaluating = true;
    const startTime = Date.now();
    const errors: string[] = [];
    let triggeredCount = 0;
    let skippedCount = 0;

    try {
      // 1. Fetch all enabled rules sorted by priority DESC (higher priority first)
      const rules = await prisma.automationRule.findMany({
        where: { enabled: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });

      if (rules.length === 0) {
        this.lastCycleAt = new Date();
        this.lastCycleDurationMs = Date.now() - startTime;
        this.cycleCount++;
        return { evaluatedCount: 0, triggeredCount: 0, skippedCount: 0, errors: [] };
      }

      // 2. Fetch all devices to build an in-memory lookup map
      const devices = await prisma.device.findMany({
        include: { catalogItem: true },
      });
      const deviceMap = new Map<string, any>(devices.map((d) => [d.id, d]));

      const now = new Date();
      // Track devices modified in this cycle for conflict resolution (ruleId -> priority)
      const devicesClaimedInCycle = new Map<string, { ruleId: string; ruleName: string; priority: number }>();

      // 3. Process each rule in priority sequence
      for (const rule of rules) {
        try {
          const conditions = (rule.conditions as unknown as RuleCondition[]) || [];
          const actions = (rule.actions as unknown as RuleAction[]) || [];
          const conditionOperator = (rule.conditionOperator as ConditionOperator) || 'ALL';

          // A. Evaluate conditions
          const evaluation = AutomationEvaluator.evaluateConditions(
            conditions,
            conditionOperator,
            deviceMap,
            now
          );

          const previousMet = this.rulePreviousMetState.get(rule.id) || false;
          let shouldTrigger = false;
          let skipReason: string | undefined;

          if (evaluation.isMet) {
            // Check trigger mode
            if (rule.triggerMode === 'WHEN_CONDITION_BECOMES_TRUE') {
              if (!previousMet) {
                shouldTrigger = true;
              } else {
                skipReason = 'Condition remained TRUE (edge trigger already fired)';
              }
            } else {
              // 'WHILE_CONDITION_IS_TRUE' or 'SCHEDULED'
              shouldTrigger = true;
            }

            // Update edge tracking state
            this.rulePreviousMetState.set(rule.id, true);
          } else {
            // Condition is not met, reset edge state
            this.rulePreviousMetState.set(rule.id, false);
            skipReason = 'Conditions not met';
          }

          // B. Cooldown Check
          if (shouldTrigger && rule.lastTriggeredAt) {
            const elapsedSeconds = (now.getTime() - rule.lastTriggeredAt.getTime()) / 1000;
            if (elapsedSeconds < rule.cooldownSeconds) {
              shouldTrigger = false;
              const remaining = Math.ceil(rule.cooldownSeconds - elapsedSeconds);
              skipReason = `Cooldown active (${remaining}s remaining)`;
            }
          }

          // C. Anti-Loop Protection Check across target devices
          if (shouldTrigger) {
            for (const action of actions) {
              if (this.isDeviceInLoop(action.deviceId, now.getTime())) {
                shouldTrigger = false;
                skipReason = `Anti-loop protection: target device '${action.deviceId}' triggered too frequently`;
                break;
              }
            }
          }

          // D. If not triggering, log skipped count if condition was met but skipped
          if (!shouldTrigger) {
            skippedCount++;
            continue;
          }

          // E. Conflict Resolution: Filter actions if a higher-priority rule already modified the device in this cycle
          const filteredActions: RuleAction[] = [];
          for (const action of actions) {
            const claimed = devicesClaimedInCycle.get(action.deviceId);
            if (claimed && claimed.ruleId !== rule.id) {
              console.warn(
                `⚡ [AutomationEngine] Conflict: Rule '${rule.name}' skipped action on device '${action.deviceId}' (already controlled by higher-priority rule '${claimed.ruleName}')`
              );
              continue;
            }
            filteredActions.push(action);
            devicesClaimedInCycle.set(action.deviceId, {
              ruleId: rule.id,
              ruleName: rule.name,
              priority: rule.priority,
            });
          }

          if (filteredActions.length === 0 && actions.length > 0) {
            skippedCount++;
            continue;
          }

          // F. Record trigger event for anti-loop tracking
          for (const action of filteredActions) {
            this.recordDeviceTrigger(action.deviceId, now.getTime());
          }

          // G. Execute Rule Trigger
          await this.executeRule(rule, evaluation.results, filteredActions, deviceMap, now);
          triggeredCount++;
        } catch (ruleErr: any) {
          const msg = `Error evaluating rule '${rule.name}' (${rule.id}): ${ruleErr.message}`;
          console.error(`❌ [AutomationEngine] ${msg}`);
          errors.push(msg);
        }
      }

      this.lastCycleAt = new Date();
      this.lastCycleDurationMs = Date.now() - startTime;
      this.cycleCount++;

      return {
        evaluatedCount: rules.length,
        triggeredCount,
        skippedCount,
        errors,
      };
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Executes a triggered rule: creates execution record, runs actions via ActionRunner, logs result
   */
  private async executeRule(
    rule: any,
    conditionResults: any[],
    actions: RuleAction[],
    deviceMap: Map<string, any>,
    now: Date
  ): Promise<void> {
    // 1. Create PENDING execution record
    const triggerSnapshot = {
      timestamp: now.toISOString(),
      ruleName: rule.name,
      triggerType: rule.triggerType,
      conditions: conditionResults.map((c) => ({
        type: c.condition.type,
        isMet: c.isMet,
        actualValue: c.actualValue,
        targetValue: c.targetValue,
        message: c.message,
      })),
    };

    const execution = await prisma.automationExecution.create({
      data: {
        ruleId: rule.id,
        status: 'PROCESSING',
        triggerData: triggerSnapshot,
        startedAt: now,
      },
    });

    console.log(`🚀 [AutomationEngine] Fired rule '${rule.name}' [${rule.id}] -> Execution ${execution.id}`);

    // 2. Dispatch actions sequentially through Phase 6 DeviceManagementService
    const actionResult = await AutomationActionRunner.executeActions(actions, deviceMap);

    // 3. Finalize execution record
    const completedAt = new Date();
    await prisma.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: actionResult.status,
        executionResult: actionResult.outcomes as any,
        errorMessage: actionResult.errorMessage || null,
        completedAt,
      },
    });

    // 4. Update Rule runtime metadata
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: {
        lastTriggeredAt: completedAt,
        lastExecutionStatus: actionResult.status,
        executionCount: { increment: 1 },
      },
    });
  }

  /**
   * Dry-run evaluation: tests rule conditions and action validity without modifying devices or database
   */
  public async evaluateDryRun(ruleData: {
    name?: string;
    conditions: RuleCondition[];
    conditionOperator?: ConditionOperator;
    actions: RuleAction[];
  }): Promise<DryRunTestResult> {
    const devices = await prisma.device.findMany({
      include: { catalogItem: true },
    });
    const deviceMap = new Map<string, any>(devices.map((d) => [d.id, d]));

    const conditionOperator = ruleData.conditionOperator || 'ALL';
    const conditions = ruleData.conditions || [];
    const actions = ruleData.actions || [];

    // Evaluate conditions against live state
    const evaluation = AutomationEvaluator.evaluateConditions(
      conditions,
      conditionOperator,
      deviceMap,
      new Date()
    );

    // Validate all actions
    const actionValidations = actions.map((act) => {
      const val = AutomationActionRunner.validateAction(act, deviceMap);
      return {
        deviceId: act.deviceId,
        deviceName: val.deviceName,
        deviceType: val.deviceType,
        commandType: act.commandType,
        payload: act.payload,
        isValid: val.isValid,
        reason: val.reason,
      };
    });

    const warnings: string[] = [];
    if (conditions.length === 0) {
      warnings.push('Rule has no conditions defined.');
    }
    if (actions.length === 0) {
      warnings.push('Rule has no actions defined.');
    }

    const invalidActions = actionValidations.filter((a) => !a.isValid);
    if (invalidActions.length > 0) {
      warnings.push(`${invalidActions.length} action(s) failed capability or safety validation.`);
    }

    const overallValid = invalidActions.length === 0 && conditions.length > 0 && actions.length > 0;

    return {
      ruleName: ruleData.name || 'Dry Run Rule Draft',
      isConditionMet: evaluation.isMet,
      conditionOperator,
      conditionsEvaluated: evaluation.results,
      actionValidations,
      overallValid,
      warnings,
    };
  }

  /**
   * Anti-loop helper: checks if a device was triggered too frequently in rolling window
   */
  private isDeviceInLoop(deviceId: string, nowMs: number): boolean {
    const history = this.deviceTriggerHistory.get(deviceId);
    if (!history) return false;

    // Prune entries older than window
    const recent = history.filter((h) => nowMs - h.timestamp < this.TRIGGER_WINDOW_MS);
    this.deviceTriggerHistory.set(deviceId, recent);

    return recent.length >= this.MAX_TRIGGERS_PER_WINDOW;
  }

  /**
   * Anti-loop helper: records device trigger timestamp
   */
  private recordDeviceTrigger(deviceId: string, nowMs: number): void {
    const history = this.deviceTriggerHistory.get(deviceId) || [];
    history.push({ timestamp: nowMs });
    this.deviceTriggerHistory.set(deviceId, history);
  }
}
