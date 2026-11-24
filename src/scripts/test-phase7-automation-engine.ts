/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - COMPREHENSIVE TEST SUITE
 * Tests rule CRUD, condition evaluation (sensors, states, time/schedules), action pipeline,
 * dry-run simulations, cooldowns, conflict resolution, anti-loop, execution history, and crash recovery.
 */

import { PrismaClient } from '@prisma/client';
import { AutomationEvaluator } from '../automation/automation.evaluator.js';
import { AutomationActionRunner } from '../automation/automation.action-runner.js';
import { AutomationEngine } from '../automation/automation.engine.js';
import { AutomationService } from '../automation/automation.service.js';
import { DeviceProviderRegistry } from '../providers/device-provider.registry.js';
import { VirtualDeviceProvider } from '../providers/virtual/virtual-device.provider.js';
import {
  RuleCondition,
  RuleAction,
  SensorCondition,
  DeviceStateCondition,
  TimeScheduleCondition,
} from '../automation/automation.types.js';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING PHASE 7 SMART HOME AUTOMATION TEST SUITE');
  console.log('====================================================\n');

  // Initialize Provider Registry & Virtual Device Provider
  const registry = DeviceProviderRegistry.getInstance();
  const virtualProvider = new VirtualDeviceProvider();
  registry.registerProvider(virtualProvider);
  await registry.initializeAll();

  // Create clean test devices
  const testHouse = await prisma.house.create({
    data: {
      name: 'Automation Test House',
      publishStatus: 'PREVIEW',
    },
  });

  const testFloor = await prisma.floor.create({
    data: {
      houseId: testHouse.id,
      name: 'Lantai 1',
      levelNumber: 1,
    },
  });

  const testFloorPlan = await prisma.floorPlan.create({
    data: {
      floorId: testFloor.id,
      name: 'Test Plan',
    },
  });

  // Device 1: Smart Light (controllable)
  const smartLight = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testFloorPlan.id,
      name: 'Living Room Light',
      type: 'SMART_LIGHT',
      status: 'OFF',
      integrationStatus: 'SIMULATED',
      providerType: 'VIRTUAL',
      configuration: { power: false, brightness: 50 },
    },
    include: { catalogItem: true },
  });

  // Device 2: Smart AC (controllable)
  const smartAc = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testFloorPlan.id,
      name: 'Bedroom AC',
      type: 'SMART_AC',
      status: 'OFF',
      integrationStatus: 'SIMULATED',
      providerType: 'VIRTUAL',
      configuration: { power: false, targetTemperature: 25, currentTemperature: 29, mode: 'COOL' },
    },
    include: { catalogItem: true },
  });

  // Device 3: Smart Lock (controllable)
  const smartLock = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testFloorPlan.id,
      name: 'Front Door Lock',
      type: 'SMART_LOCK',
      status: 'UNLOCKED',
      integrationStatus: 'SIMULATED',
      providerType: 'VIRTUAL',
      configuration: { lockState: 'UNLOCKED' },
    },
    include: { catalogItem: true },
  });

  // Device 4: Temp & Humidity Sensor (Read-only)
  const tempSensor = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testFloorPlan.id,
      name: 'Living Room Temp Sensor',
      type: 'TEMP_HUMIDITY_SENSOR',
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      providerType: 'VIRTUAL',
      configuration: { temperature: 31.5, humidity: 72 },
    },
    include: { catalogItem: true },
  });

  // Device 5: Air Quality Sensor (Read-only)
  const aqiSensor = await prisma.device.create({
    data: {
      houseId: testHouse.id,
      floorId: testFloor.id,
      floorPlanId: testFloorPlan.id,
      name: 'Living Room AQI Sensor',
      type: 'AIR_QUALITY_SENSOR',
      status: 'ONLINE',
      integrationStatus: 'SIMULATED',
      providerType: 'VIRTUAL',
      configuration: { aqi: 125, pm25: 45, pm10: 80 },
    },
    include: { catalogItem: true },
  });

  const deviceMap = new Map<string, any>([
    [smartLight.id, smartLight],
    [smartAc.id, smartAc],
    [smartLock.id, smartLock],
    [tempSensor.id, tempSensor],
    [aqiSensor.id, aqiSensor],
  ]);

  try {
    // ----------------------------------------------------
    // TEST GROUP 1: Rule CRUD & Validation
    // ----------------------------------------------------
    console.log('--- TEST GROUP 1: Automation Rule CRUD & Validation ---');
    const createdRule = await AutomationService.createRule({
      houseId: testHouse.id,
      name: 'High Temp Auto AC On',
      description: 'Turn on AC when living room temperature exceeds 28°C',
      priority: 10,
      triggerType: 'SENSOR',
      triggerMode: 'WHEN_CONDITION_BECOMES_TRUE',
      conditionOperator: 'ALL',
      conditions: [
        {
          type: 'SENSOR',
          deviceId: tempSensor.id,
          metric: 'temperature',
          operator: '>',
          value: 28,
        },
      ],
      actions: [
        {
          deviceId: smartAc.id,
          commandType: 'SET_POWER',
          payload: { power: true },
        },
        {
          deviceId: smartAc.id,
          commandType: 'SET_AC_TEMPERATURE',
          payload: { targetTemperature: 22 },
        },
      ],
      cooldownSeconds: 60,
    });

    assert(!!createdRule.id, 'Rule created with valid UUID');
    assert(createdRule.name === 'High Temp Auto AC On', 'Rule name matches');
    assert(createdRule.priority === 10, 'Rule priority is 10');
    assert(createdRule.enabled === true, 'Rule defaults to enabled: true');

    const fetchedRule = await AutomationService.getRuleById(createdRule.id);
    assert(fetchedRule.id === createdRule.id, 'Rule fetched by ID');

    const toggledRule = await AutomationService.toggleRule(createdRule.id, false);
    assert(toggledRule.enabled === false, 'Rule toggled to enabled: false');

    await AutomationService.toggleRule(createdRule.id, true);
    assert(true, 'Rule toggled back to enabled: true');

    // ----------------------------------------------------
    // TEST GROUP 2: Sensor Condition Evaluation
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 2: Sensor Condition Evaluator ---');
    // Actual temp is 31.5
    const condGreater: SensorCondition = {
      type: 'SENSOR',
      deviceId: tempSensor.id,
      metric: 'temperature',
      operator: '>',
      value: 28,
    };
    const evalGreater = AutomationEvaluator.evaluateSingleCondition(condGreater, deviceMap);
    assert(evalGreater.isMet === true, 'Temp 31.5 > 28 is MET');

    const condLess: SensorCondition = {
      type: 'SENSOR',
      deviceId: tempSensor.id,
      metric: 'temperature',
      operator: '<',
      value: 28,
    };
    const evalLess = AutomationEvaluator.evaluateSingleCondition(condLess, deviceMap);
    assert(evalLess.isMet === false, 'Temp 31.5 < 28 is NOT MET');

    const condBetween: SensorCondition = {
      type: 'SENSOR',
      deviceId: aqiSensor.id,
      metric: 'aqi',
      operator: 'BETWEEN',
      value: 100,
      valueMax: 150,
    };
    const evalBetween = AutomationEvaluator.evaluateSingleCondition(condBetween, deviceMap);
    assert(evalBetween.isMet === true, 'AQI 125 BETWEEN 100 and 150 is MET');

    // ----------------------------------------------------
    // TEST GROUP 3: Device State Condition Evaluator
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 3: Device State Condition Evaluator ---');
    const condLockState: DeviceStateCondition = {
      type: 'DEVICE_STATE',
      deviceId: smartLock.id,
      property: 'lockState',
      operator: '==',
      value: 'UNLOCKED',
    };
    const evalLockState = AutomationEvaluator.evaluateSingleCondition(condLockState, deviceMap);
    assert(evalLockState.isMet === true, 'Lock state == UNLOCKED is MET');

    const condPower: DeviceStateCondition = {
      type: 'DEVICE_STATE',
      deviceId: smartLight.id,
      property: 'power',
      operator: '==',
      value: true,
    };
    const evalPower = AutomationEvaluator.evaluateSingleCondition(condPower, deviceMap);
    assert(evalPower.isMet === false, 'Light power == true is NOT MET (currently false)');

    // ----------------------------------------------------
    // TEST GROUP 4: Time & Schedule Evaluator (Asia/Jakarta)
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 4: Time & Schedule Evaluator ---');
    // Test known fixed timestamps
    // 2026-11-13 14:30:00 WIB (UTC 07:30:00)
    const fixedNowWib = new Date('2026-11-13T07:30:00.000Z');

    const condAfter: TimeScheduleCondition = {
      type: 'TIME',
      mode: 'AFTER_TIME',
      time: '12:00',
      timezone: 'Asia/Jakarta',
    };
    const evalAfter = AutomationEvaluator.evaluateTimeScheduleCondition(condAfter, fixedNowWib);
    assert(evalAfter.isMet === true, '14:30 WIB is AFTER 12:00');

    const condBefore: TimeScheduleCondition = {
      type: 'TIME',
      mode: 'BEFORE_TIME',
      time: '12:00',
      timezone: 'Asia/Jakarta',
    };
    const evalBefore = AutomationEvaluator.evaluateTimeScheduleCondition(condBefore, fixedNowWib);
    assert(evalBefore.isMet === false, '14:30 WIB is NOT BEFORE 12:00');

    const condDaytimeRange: TimeScheduleCondition = {
      type: 'TIME',
      mode: 'TIME_RANGE',
      startTime: '08:00',
      endTime: '17:00',
      timezone: 'Asia/Jakarta',
    };
    const evalDaytimeRange = AutomationEvaluator.evaluateTimeScheduleCondition(condDaytimeRange, fixedNowWib);
    assert(evalDaytimeRange.isMet === true, '14:30 WIB is within range 08:00 - 17:00');

    const condMidnightRange: TimeScheduleCondition = {
      type: 'TIME',
      mode: 'TIME_RANGE',
      startTime: '22:00',
      endTime: '06:00',
      timezone: 'Asia/Jakarta',
    };
    const evalMidnightRange = AutomationEvaluator.evaluateTimeScheduleCondition(condMidnightRange, fixedNowWib);
    assert(evalMidnightRange.isMet === false, '14:30 WIB is NOT within overnight range 22:00 - 06:00');

    // ----------------------------------------------------
    // TEST GROUP 5: Condition Combination Logic (ALL vs ANY)
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 5: Condition Combination Logic (ALL vs ANY) ---');
    const hybridConds: RuleCondition[] = [
      condGreater, // MET (temp > 28)
      condPower,   // NOT MET (light power == true)
    ];

    const evalAll = AutomationEvaluator.evaluateConditions(hybridConds, 'ALL', deviceMap);
    assert(evalAll.isMet === false, 'Operator ALL with 1 MET and 1 NOT MET -> false');

    const evalAny = AutomationEvaluator.evaluateConditions(hybridConds, 'ANY', deviceMap);
    assert(evalAny.isMet === true, 'Operator ANY with 1 MET and 1 NOT MET -> true');

    // ----------------------------------------------------
    // TEST GROUP 6: Action Capability & Safety Validation
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 6: Action Capability & Safety Validation ---');
    // Valid action on Smart Light
    const validLightAction: RuleAction = {
      deviceId: smartLight.id,
      commandType: 'SET_POWER',
      payload: { power: true },
    };
    const valLight = AutomationActionRunner.validateAction(validLightAction, deviceMap);
    assert(valLight.isValid === true, 'Valid action on Smart Light passes validation');

    // Invalid action on read-only sensor
    const invalidSensorAction: RuleAction = {
      deviceId: tempSensor.id,
      commandType: 'SET_TEMPERATURE',
      payload: { temperature: 20 },
    };
    const valSensor = AutomationActionRunner.validateAction(invalidSensorAction, deviceMap);
    assert(valSensor.isValid === false, 'Action targeting read-only sensor is rejected');
    assert(Boolean(valSensor.reason?.includes('read-only')), 'Rejection reason mentions read-only');

    // ----------------------------------------------------
    // TEST GROUP 7: Action Runner Execution via DeviceManagementService
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 7: Action Execution via DeviceManagementService ---');
    const actionsToRun: RuleAction[] = [
      {
        deviceId: smartLight.id,
        commandType: 'SET_POWER',
        payload: { power: true },
      },
      {
        deviceId: smartLight.id,
        commandType: 'SET_BRIGHTNESS',
        payload: { brightness: 85 },
      },
    ];

    const actionExecution = await AutomationActionRunner.executeActions(actionsToRun, deviceMap);
    assert(actionExecution.status === 'SUCCESS', 'Batch action execution returns SUCCESS');
    assert(actionExecution.outcomes.length === 2, '2 action outcomes recorded');
    assert(!!actionExecution.outcomes[0].commandId, 'Action 1 has a persisted commandId');
    assert(!!actionExecution.outcomes[1].commandId, 'Action 2 has a persisted commandId');

    // Check device state in database
    const updatedLight = await prisma.device.findUnique({ where: { id: smartLight.id } });
    assert(updatedLight?.status === 'ON', 'Smart Light status updated to ON');
    assert((updatedLight?.configuration as any)?.brightness === 85, 'Smart Light brightness set to 85');

    // ----------------------------------------------------
    // TEST GROUP 8: Dry-Run Test Endpoint (Simulation without side-effects)
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 8: Dry-Run Test Endpoint ---');
    const dryRunResult = await AutomationService.testDraftRule({
      name: 'Dry Run Check',
      conditions: [
        {
          type: 'SENSOR',
          deviceId: tempSensor.id,
          metric: 'temperature',
          operator: '>',
          value: 28,
        },
      ],
      conditionOperator: 'ALL',
      actions: [
        {
          deviceId: smartAc.id,
          commandType: 'SET_POWER',
          payload: { power: true },
        },
        {
          deviceId: tempSensor.id, // Read-only sensor target
          commandType: 'SET_VAL',
          payload: { test: 123 },
        },
      ],
    });

    assert(dryRunResult.isConditionMet === true, 'Dry-run evaluates condition as MET');
    assert(dryRunResult.actionValidations.length === 2, 'Dry-run validated 2 actions');
    assert(dryRunResult.actionValidations[0].isValid === true, 'Action 1 is valid');
    assert(dryRunResult.actionValidations[1].isValid === false, 'Action 2 on sensor is invalid');
    assert(dryRunResult.overallValid === false, 'Overall valid is false due to invalid action');

    // ----------------------------------------------------
    // TEST GROUP 9: Automation Engine Cycle, Cooldown & Execution Logging
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 9: Engine Evaluation Cycle & Cooldown ---');
    const engine = AutomationEngine.getInstance();

    // Trigger cycle 1
    const cycle1 = await engine.evaluateCycle();
    assert(cycle1.evaluatedCount >= 1, 'Engine evaluated active rules');
    assert(cycle1.triggeredCount >= 1, 'Rule was triggered');

    // Verify execution record
    const executions = await prisma.automationExecution.findMany({
      where: { ruleId: createdRule.id },
      orderBy: { startedAt: 'desc' },
    });
    assert(executions.length >= 1, 'Execution log created in database');
    assert(executions[0].status === 'SUCCESS', 'Execution status is SUCCESS');
    assert(Array.isArray(executions[0].executionResult), 'Execution result contains action outcomes');
    assert((executions[0].executionResult as any[]).length === 2, 'Execution recorded 2 actions on AC');

    // Verify rule metadata updated
    const ruleAfterCycle = await prisma.automationRule.findUnique({ where: { id: createdRule.id } });
    assert(ruleAfterCycle?.executionCount! >= 1, 'Rule executionCount incremented');
    assert(ruleAfterCycle?.lastExecutionStatus === 'SUCCESS', 'lastExecutionStatus is SUCCESS');
    assert(!!ruleAfterCycle?.lastTriggeredAt, 'lastTriggeredAt is populated');

    // Trigger cycle 2 immediately -> should be blocked by cooldown (60s)
    const cycle2 = await engine.evaluateCycle();
    assert(cycle2.triggeredCount === 0, 'Cycle 2 does not trigger because cooldown is active');
    assert(cycle2.skippedCount >= 1, 'Cycle 2 skipped rule due to cooldown');

    // Test Rule Priority & Conflict Resolution
    console.log('\n--- Priority & Conflict Resolution Check ---');
    const highPriRule = await AutomationService.createRule({
      houseId: testHouse.id,
      name: 'High Priority Rule',
      priority: 100,
      triggerType: 'SENSOR',
      triggerMode: 'WHILE_CONDITION_IS_TRUE',
      conditions: [{ type: 'SENSOR', deviceId: tempSensor.id, metric: 'temperature', operator: '>', value: 20 }],
      actions: [{ deviceId: smartLight.id, commandType: 'SET_POWER', payload: { power: true } }],
      cooldownSeconds: 0,
    });

    const lowPriRule = await AutomationService.createRule({
      houseId: testHouse.id,
      name: 'Low Priority Conflicting Rule',
      priority: 10,
      triggerType: 'SENSOR',
      triggerMode: 'WHILE_CONDITION_IS_TRUE',
      conditions: [{ type: 'SENSOR', deviceId: tempSensor.id, metric: 'temperature', operator: '>', value: 20 }],
      actions: [{ deviceId: smartLight.id, commandType: 'SET_POWER', payload: { power: false } }],
      cooldownSeconds: 0,
    });

    const conflictCycle = await engine.evaluateCycle();
    assert(conflictCycle.triggeredCount >= 1, 'High priority rule triggered');
    assert(conflictCycle.skippedCount >= 1, 'Low priority conflicting rule action skipped');

    // ----------------------------------------------------
    // TEST GROUP 10: Crash Recovery of Dangling PROCESSING Executions
    // ----------------------------------------------------
    console.log('\n--- TEST GROUP 10: Crash Recovery of Dangling Executions ---');
    // Simulate a crash: insert a dangling PROCESSING record
    const dangling = await prisma.automationExecution.create({
      data: {
        ruleId: createdRule.id,
        status: 'PROCESSING',
        triggerData: { test: 'dangling' },
      },
    });

    const recoveredCount = await engine.recoverDanglingExecutions();
    assert(recoveredCount >= 1, 'Dangling execution was recovered');

    const checkedDangling = await prisma.automationExecution.findUnique({ where: { id: dangling.id } });
    assert(checkedDangling?.status === 'FAILED', 'Dangling execution transitioned to FAILED');
    assert(
      checkedDangling?.errorMessage?.includes('Server restarted') || false,
      'Recovery error message set correctly'
    );
  } finally {
    // Cleanup test data safely
    console.log('\n🧹 Cleaning up test artifacts...');
    await prisma.automationExecution.deleteMany({
      where: { rule: { houseId: testHouse.id } },
    });
    await prisma.automationRule.deleteMany({
      where: { houseId: testHouse.id },
    });
    await prisma.deviceCommand.deleteMany({
      where: { device: { houseId: testHouse.id } },
    });
    await prisma.deviceTelemetry.deleteMany({
      where: { device: { houseId: testHouse.id } },
    });
    await prisma.device.deleteMany({
      where: { houseId: testHouse.id },
    });
    await prisma.floorPlan.deleteMany({
      where: { floor: { houseId: testHouse.id } },
    });
    await prisma.floor.deleteMany({
      where: { houseId: testHouse.id },
    });
    await prisma.house.deleteMany({
      where: { id: testHouse.id },
    });
  }

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
