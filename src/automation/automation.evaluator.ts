/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - EVALUATOR
 * Pure functional evaluator for sensor conditions, device state conditions, and time schedules.
 */

import {
  RuleCondition,
  SensorCondition,
  DeviceStateCondition,
  TimeScheduleCondition,
  ConditionEvaluationResult,
  ComparisonOperator,
  ConditionOperator,
} from './automation.types.js';

export class AutomationEvaluator {
  /**
   * Evaluates all conditions of a rule against the current device states and wall-clock time.
   */
  public static evaluateConditions(
    conditions: RuleCondition[],
    conditionOperator: ConditionOperator,
    deviceMap: Map<string, any>,
    now: Date = new Date()
  ): {
    isMet: boolean;
    results: ConditionEvaluationResult[];
  } {
    if (!conditions || conditions.length === 0) {
      return {
        isMet: false,
        results: [
          {
            condition: { type: 'SENSOR' } as any,
            isMet: false,
            message: 'No conditions defined for rule',
          },
        ],
      };
    }

    const results: ConditionEvaluationResult[] = conditions.map((cond) =>
      this.evaluateSingleCondition(cond, deviceMap, now)
    );

    let isMet: boolean;
    if (conditionOperator === 'ANY') {
      isMet = results.some((r) => r.isMet);
    } else {
      // Default to 'ALL'
      isMet = results.every((r) => r.isMet);
    }

    return { isMet, results };
  }

  /**
   * Evaluates a single condition.
   */
  public static evaluateSingleCondition(
    condition: RuleCondition,
    deviceMap: Map<string, any>,
    now: Date = new Date()
  ): ConditionEvaluationResult {
    switch (condition.type) {
      case 'SENSOR':
        return this.evaluateSensorCondition(condition, deviceMap);
      case 'DEVICE_STATE':
        return this.evaluateDeviceStateCondition(condition, deviceMap);
      case 'TIME':
      case 'SCHEDULE':
        return this.evaluateTimeScheduleCondition(condition, now);
      default:
        return {
          condition,
          isMet: false,
          message: `Unknown condition type: ${(condition as any).type}`,
        };
    }
  }

  /**
   * Evaluates a sensor condition (e.g. temperature > 28, aqi >= 100).
   */
  public static evaluateSensorCondition(
    condition: SensorCondition,
    deviceMap: Map<string, any>
  ): ConditionEvaluationResult {
    const device = deviceMap.get(condition.deviceId);
    if (!device) {
      return {
        condition,
        isMet: false,
        message: `Sensor device '${condition.deviceId}' not found or offline`,
      };
    }

    const metric = condition.metric.toLowerCase();
    const config = device.configuration || {};
    let actualValue: number | undefined;

    // Check configuration properties
    if (config[metric] !== undefined && config[metric] !== null) {
      actualValue = Number(config[metric]);
    } else if (metric === 'temperature' && config.currentTemperature !== undefined) {
      actualValue = Number(config.currentTemperature);
    } else if (metric === 'humidity' && config.humidity !== undefined) {
      actualValue = Number(config.humidity);
    } else if (metric === 'aqi' && config.aqi !== undefined) {
      actualValue = Number(config.aqi);
    } else if (metric === 'pm25' && config.pm25 !== undefined) {
      actualValue = Number(config.pm25);
    } else if (metric === 'pm10' && config.pm10 !== undefined) {
      actualValue = Number(config.pm10);
    }

    if (actualValue === undefined || isNaN(actualValue)) {
      return {
        condition,
        isMet: false,
        actualValue: null,
        targetValue: condition.value,
        message: `Metric '${condition.metric}' has no numeric value on device '${device.name}'`,
      };
    }

    // Apply comparison
    const isMet = this.compareNumeric(
      actualValue,
      condition.operator,
      condition.value,
      condition.valueMax
    );

    return {
      condition,
      isMet,
      actualValue,
      targetValue: condition.operator === 'BETWEEN' ? `${condition.value} - ${condition.valueMax}` : condition.value,
      message: `Device '${device.name}' ${metric}: actual=${actualValue} ${condition.operator} target=${condition.value} -> ${isMet ? 'MET' : 'NOT MET'}`,
    };
  }

  /**
   * Evaluates a device state condition (e.g. power == true, lockState == 'UNLOCKED').
   */
  public static evaluateDeviceStateCondition(
    condition: DeviceStateCondition,
    deviceMap: Map<string, any>
  ): ConditionEvaluationResult {
    const device = deviceMap.get(condition.deviceId);
    if (!device) {
      return {
        condition,
        isMet: false,
        message: `Device '${condition.deviceId}' not found or offline`,
      };
    }

    const config = device.configuration || {};
    const prop = condition.property;
    let actualValue: any = config[prop];

    // Fallbacks for well-known properties
    if (actualValue === undefined) {
      if (prop === 'power') {
        actualValue = config.power !== undefined ? config.power : device.status === 'ON';
      } else if (prop === 'status') {
        actualValue = device.status;
      } else if (prop === 'lockState') {
        actualValue = config.lockState || device.status;
      }
    }

    const isMet = this.compareState(
      actualValue,
      condition.operator,
      condition.value,
      condition.valueMax
    );

    return {
      condition,
      isMet,
      actualValue,
      targetValue: condition.value,
      message: `Device '${device.name}' ${prop}: actual=${actualValue} ${condition.operator} target=${JSON.stringify(condition.value)} -> ${isMet ? 'MET' : 'NOT MET'}`,
    };
  }

  /**
   * Evaluates a time/schedule condition (e.g. after 22:00, or between 08:00 and 17:00).
   * Default timezone: 'Asia/Jakarta' (WIB, UTC+7).
   */
  public static evaluateTimeScheduleCondition(
    condition: TimeScheduleCondition,
    now: Date = new Date()
  ): ConditionEvaluationResult {
    const tz = condition.timezone || 'Asia/Jakarta';

    // 1. Get current time in specified timezone
    let currentHour = 0;
    let currentMinute = 0;
    let currentDayOfWeek = 0; // 0 = Sun, 1 = Mon ... 6 = Sat

    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
      }).formatToParts(now);

      const hourStr = parts.find((p) => p.type === 'hour')?.value || '0';
      const minStr = parts.find((p) => p.type === 'minute')?.value || '0';
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value || 'Sun';

      currentHour = parseInt(hourStr, 10);
      // In 24-hour format en-US may return 24 for midnight in some versions
      if (currentHour === 24) currentHour = 0;
      currentMinute = parseInt(minStr, 10);

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      currentDayOfWeek = days.indexOf(weekdayStr);
      if (currentDayOfWeek === -1) currentDayOfWeek = 0;
    } catch {
      // Fallback to UTC+7 if tz format throws
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const wibDate = new Date(utc + 7 * 3600000);
      currentHour = wibDate.getHours();
      currentMinute = wibDate.getMinutes();
      currentDayOfWeek = wibDate.getDay();
    }

    // 2. Check days of week restriction
    if (condition.daysOfWeek && condition.daysOfWeek.length > 0) {
      if (!condition.daysOfWeek.includes(currentDayOfWeek)) {
        return {
          condition,
          isMet: false,
          actualValue: `Day ${currentDayOfWeek} (${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')})`,
          targetValue: condition.daysOfWeek,
          message: `Current day (${currentDayOfWeek}) not in allowed schedule days [${condition.daysOfWeek.join(',')}]`,
        };
      }
    }

    const currentMinutes = currentHour * 60 + currentMinute;
    const timeToMinutes = (timeStr?: string): number => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
      return (h || 0) * 60 + (m || 0);
    };

    let isMet = false;
    let targetDesc = '';

    switch (condition.mode) {
      case 'AT_TIME': {
        const targetMin = timeToMinutes(condition.time);
        isMet = currentMinutes === targetMin;
        targetDesc = `AT ${condition.time}`;
        break;
      }
      case 'AFTER_TIME': {
        const targetMin = timeToMinutes(condition.time);
        isMet = currentMinutes >= targetMin;
        targetDesc = `AFTER ${condition.time}`;
        break;
      }
      case 'BEFORE_TIME': {
        const targetMin = timeToMinutes(condition.time);
        isMet = currentMinutes <= targetMin;
        targetDesc = `BEFORE ${condition.time}`;
        break;
      }
      case 'TIME_RANGE': {
        const startMin = timeToMinutes(condition.startTime);
        const endMin = timeToMinutes(condition.endTime);
        targetDesc = `RANGE ${condition.startTime} - ${condition.endTime}`;

        if (startMin <= endMin) {
          // Standard daytime range e.g. 08:00 to 17:00
          isMet = currentMinutes >= startMin && currentMinutes <= endMin;
        } else {
          // Cross-midnight range e.g. 22:00 to 06:00
          isMet = currentMinutes >= startMin || currentMinutes <= endMin;
        }
        break;
      }
    }

    const timeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    return {
      condition,
      isMet,
      actualValue: timeStr,
      targetValue: targetDesc,
      message: `Schedule check: time=${timeStr} (${tz}) target=${targetDesc} -> ${isMet ? 'MET' : 'NOT MET'}`,
    };
  }

  /**
   * Helper: Compares numeric values.
   */
  private static compareNumeric(
    actual: number,
    operator: ComparisonOperator,
    target: number,
    targetMax?: number
  ): boolean {
    switch (operator) {
      case '==':
        return Math.abs(actual - target) < 0.0001;
      case '!=':
        return Math.abs(actual - target) >= 0.0001;
      case '>':
        return actual > target;
      case '<':
        return actual < target;
      case '>=':
        return actual >= target;
      case '<=':
        return actual <= target;
      case 'BETWEEN':
        if (targetMax === undefined) return actual >= target;
        return actual >= target && actual <= targetMax;
      default:
        return false;
    }
  }

  /**
   * Helper: Compares state values (string, boolean, numeric, array).
   */
  private static compareState(
    actual: any,
    operator: ComparisonOperator,
    target: any,
    targetMax?: number
  ): boolean {
    if (actual === undefined || actual === null) {
      return operator === '!=' && target !== null && target !== undefined;
    }

    switch (operator) {
      case '==':
        if (typeof target === 'boolean') {
          return Boolean(actual) === target;
        }
        return String(actual).toLowerCase() === String(target).toLowerCase();
      case '!=':
        if (typeof target === 'boolean') {
          return Boolean(actual) !== target;
        }
        return String(actual).toLowerCase() !== String(target).toLowerCase();
      case '>':
        return Number(actual) > Number(target);
      case '<':
        return Number(actual) < Number(target);
      case '>=':
        return Number(actual) >= Number(target);
      case '<=':
        return Number(actual) <= Number(target);
      case 'BETWEEN':
        if (targetMax === undefined) return Number(actual) >= Number(target);
        return Number(actual) >= Number(target) && Number(actual) <= Number(targetMax);
      case 'IN':
        if (Array.isArray(target)) {
          return target.map((v) => String(v).toLowerCase()).includes(String(actual).toLowerCase());
        }
        return false;
      case 'NOT_IN':
        if (Array.isArray(target)) {
          return !target.map((v) => String(v).toLowerCase()).includes(String(actual).toLowerCase());
        }
        return true;
      default:
        return false;
    }
  }
}

