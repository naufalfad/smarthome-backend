/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - ACTION RUNNER
 * Dispatches actions through DeviceManagementService and tracks execution outcomes.
 */

import { DeviceManagementService } from '../services/device-management.service.js';
import { RuleAction, ActionExecutionOutcome } from './automation.types.js';
import { IOT_DEVICE_CATALOG } from '../constants/device-capabilities.js';

export class AutomationActionRunner {
  /**
   * Read-only device categories and types that can never be modified by automation actions
   */
  private static readonly READ_ONLY_TYPES = new Set([
    'TEMP_HUMIDITY_SENSOR',
    'AIR_QUALITY_SENSOR',
    'SENSOR',
    'SECURITY_CAMERA',
    'MOTION_SENSOR',
  ]);

  /**
   * Validates an action against catalog capabilities and safety rules without executing it (dry-run)
   */
  public static validateAction(
    action: RuleAction,
    deviceMap: Map<string, any>
  ): {
    isValid: boolean;
    reason?: string;
    deviceName: string;
    deviceType: string;
  } {
    const device = deviceMap.get(action.deviceId);
    if (!device) {
      return {
        isValid: false,
        reason: `Target device '${action.deviceId}' not found or deleted`,
        deviceName: 'Unknown',
        deviceType: 'UNKNOWN',
      };
    }

    const deviceType = device.catalogItem?.deviceType || device.type;
    const deviceName = device.name || 'Unnamed Device';

    // 1. Safety check: Sensors and read-only devices must never accept write actions
    if (this.READ_ONLY_TYPES.has(deviceType)) {
      return {
        isValid: false,
        reason: `Device '${deviceName}' is a read-only sensor (${deviceType}) and cannot accept commands`,
        deviceName,
        deviceType,
      };
    }

    // 2. Validate commandType
    if (!action.commandType) {
      return {
        isValid: false,
        reason: `Action missing commandType for device '${deviceName}'`,
        deviceName,
        deviceType,
      };
    }

    // 3. Capability check against catalog definition
    const catalogItem = IOT_DEVICE_CATALOG.find((item) => item.deviceType === deviceType);
    if (catalogItem) {
      // Find matching capability
      const payloadKeys = Object.keys(action.payload || {});
      for (const key of payloadKeys) {
        const cap = catalogItem.capabilities.find((c) => c.property === key);
        if (cap && !cap.controllable) {
          return {
            isValid: false,
            reason: `Property '${key}' on device '${deviceName}' is read-only`,
            deviceName,
            deviceType,
          };
        }
      }
    }

    return {
      isValid: true,
      deviceName,
      deviceType,
    };
  }

  /**
   * Executes a batch of actions sequentially through DeviceManagementService.
   */
  public static async executeActions(
    actions: RuleAction[],
    deviceMap: Map<string, any>
  ): Promise<{
    status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED';
    outcomes: ActionExecutionOutcome[];
    errorMessage?: string;
  }> {
    if (!actions || actions.length === 0) {
      return {
        status: 'SKIPPED',
        outcomes: [],
        errorMessage: 'No actions to execute',
      };
    }

    const outcomes: ActionExecutionOutcome[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const action of actions) {
      const device = deviceMap.get(action.deviceId);
      const deviceName = device?.name || action.deviceId;

      // Validate action safety
      const validation = this.validateAction(action, deviceMap);
      if (!validation.isValid) {
        failureCount++;
        outcomes.push({
          actionId: action.id,
          deviceId: action.deviceId,
          deviceName,
          commandType: action.commandType,
          payload: action.payload,
          status: 'FAILED',
          errorMessage: validation.reason,
        });
        continue;
      }

      try {
        // Execute through Phase 6 DeviceManagementService
        const result = await DeviceManagementService.executeCommand(action.deviceId, {
          commandType: action.commandType,
          payload: action.payload,
        });

        if (result.status === 'SUCCESS') {
          successCount++;
          outcomes.push({
            actionId: action.id,
            deviceId: action.deviceId,
            deviceName,
            commandType: action.commandType,
            payload: action.payload,
            status: 'SUCCESS',
            commandId: result.commandId,
            appliedConfig: result.appliedConfig,
          });

          // Update in-memory device configuration if available so subsequent actions/rules see latest state
          if (device && result.appliedConfig) {
            device.configuration = { ...device.configuration, ...result.appliedConfig };
            if (result.resultingStatus) {
              device.status = result.resultingStatus;
            }
          }
        } else {
          failureCount++;
          outcomes.push({
            actionId: action.id,
            deviceId: action.deviceId,
            deviceName,
            commandType: action.commandType,
            payload: action.payload,
            status: 'FAILED',
            commandId: result.commandId,
            errorMessage: result.errorMessage || 'Command execution returned FAILED status',
          });
        }
      } catch (err: any) {
        failureCount++;
        outcomes.push({
          actionId: action.id,
          deviceId: action.deviceId,
          deviceName,
          commandType: action.commandType,
          payload: action.payload,
          status: 'FAILED',
          errorMessage: err.message || 'Exception during command execution',
        });
      }
    }

    let status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'SKIPPED';
    if (failureCount === 0 && successCount > 0) {
      status = 'SUCCESS';
    } else if (successCount > 0 && failureCount > 0) {
      status = 'PARTIAL_SUCCESS';
    } else if (failureCount > 0) {
      status = 'FAILED';
    } else {
      status = 'SKIPPED';
    }

    const firstError = outcomes.find((o) => o.status === 'FAILED')?.errorMessage;

    return {
      status,
      outcomes,
      errorMessage: firstError,
    };
  }
}
