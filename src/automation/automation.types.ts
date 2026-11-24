/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - TYPES
 */

export type TriggerType = 'SENSOR' | 'DEVICE_STATE' | 'SCHEDULED' | 'HYBRID';

export type TriggerMode = 'WHEN_CONDITION_BECOMES_TRUE' | 'WHILE_CONDITION_IS_TRUE' | 'SCHEDULED';

export type ConditionOperator = 'ALL' | 'ANY';

export type ComparisonOperator =
  | '=='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'BETWEEN'
  | 'IN'
  | 'NOT_IN';

export type ConditionType = 'SENSOR' | 'DEVICE_STATE' | 'TIME' | 'SCHEDULE';

export interface BaseCondition {
  id?: string;
  type: ConditionType;
}

export interface SensorCondition extends BaseCondition {
  type: 'SENSOR';
  deviceId: string;
  metric: 'temperature' | 'humidity' | 'aqi' | 'pm25' | 'pm10' | string;
  operator: ComparisonOperator;
  value: number;
  valueMax?: number; // Used when operator is 'BETWEEN'
  hysteresis?: number; // Optional deadband / flutter protection
}

export interface DeviceStateCondition extends BaseCondition {
  type: 'DEVICE_STATE';
  deviceId: string;
  property: 'power' | 'status' | 'brightness' | 'lockState' | 'targetTemperature' | 'mode' | 'fanSpeed' | string;
  operator: ComparisonOperator;
  value: boolean | string | number | Array<string | number>;
  valueMax?: number; // For BETWEEN
}

export interface TimeScheduleCondition extends BaseCondition {
  type: 'TIME' | 'SCHEDULE';
  mode: 'AT_TIME' | 'AFTER_TIME' | 'BEFORE_TIME' | 'TIME_RANGE';
  time?: string; // "HH:mm" in 24h format, e.g. "22:00"
  startTime?: string; // "HH:mm" for TIME_RANGE
  endTime?: string; // "HH:mm" for TIME_RANGE
  daysOfWeek?: number[]; // [0 = Sun, 1 = Mon, ..., 6 = Sat]. If empty or undefined, applies all days
  timezone?: string; // Default: 'Asia/Jakarta'
}

export type RuleCondition = SensorCondition | DeviceStateCondition | TimeScheduleCondition;

export interface RuleAction {
  id?: string;
  deviceId: string;
  commandType: string; // e.g. 'SET_POWER', 'SET_BRIGHTNESS', 'SET_AC_TEMPERATURE', 'SET_AC_MODE', 'SET_LOCK_STATE'
  payload: Record<string, any>; // e.g. { power: true }, { brightness: 80 }, { lockState: 'LOCKED' }
  description?: string;
}

export interface ConditionEvaluationResult {
  condition: RuleCondition;
  isMet: boolean;
  actualValue?: any;
  targetValue?: any;
  message: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  isMet: boolean;
  conditionOperator: ConditionOperator;
  conditionsEvaluated: ConditionEvaluationResult[];
  shouldTrigger: boolean;
  skipReason?: string;
}

export interface ActionExecutionOutcome {
  actionId?: string;
  deviceId: string;
  deviceName?: string;
  commandType: string;
  payload: Record<string, any>;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  commandId?: string;
  appliedConfig?: Record<string, any>;
  errorMessage?: string;
}

export interface RuleExecutionResult {
  ruleId: string;
  executionId: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED';
  triggerData: Record<string, any>;
  actionOutcomes: ActionExecutionOutcome[];
  errorMessage?: string;
  startedAt: Date;
  completedAt: Date;
}

export interface DryRunTestResult {
  ruleName: string;
  isConditionMet: boolean;
  conditionOperator: ConditionOperator;
  conditionsEvaluated: ConditionEvaluationResult[];
  actionValidations: Array<{
    deviceId: string;
    deviceName: string;
    deviceType: string;
    commandType: string;
    payload: Record<string, any>;
    isValid: boolean;
    reason?: string;
  }>;
  overallValid: boolean;
  warnings: string[];
}

export interface AutomationEngineStatus {
  isRunning: boolean;
  cycleCount: number;
  lastCycleAt: string | null;
  lastCycleDurationMs: number;
  activeRulesCount: number;
  totalExecutionsCount: number;
  cooldownActiveRules: number;
}

