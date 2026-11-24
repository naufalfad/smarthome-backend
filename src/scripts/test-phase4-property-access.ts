/**
 * PHASE 4 VERIFICATION TEST SUITE
 * Multi-Tenant Authorization, State-Gated Policy Guard, IDOR Prevention,
 * UUID Parameter Validation, Dashboard Multi-Property Resolution & Regressions
 */

import http from 'http';

process.env.NODE_ENV = 'test';

const { config: _envConfig } = await import('../config/env.js');
void _envConfig;
const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { AuthService } = await import('../services/auth.service.js');
const { AutomationService } = await import('../automation/automation.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');

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

async function runPhase4Tests() {
  console.log('===================================================================');
  console.log('🛡️  PHASE 4: MULTI-TENANT AUTHORIZATION & POLICY GUARD TEST SUITE');
  console.log('===================================================================\n');

  const uniqueTag = Date.now().toString(36);
  const createdUserIds: string[] = [];
  const createdHouseIds: string[] = [];
  const createdFloorIds: string[] = [];
  const createdFloorPlanIds: string[] = [];
  const createdRoomIds: string[] = [];
  const createdDeviceIds: string[] = [];
  const createdRuleIds: string[] = [];

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // ------------------------------------------------------------------
    // SETUP FIXTURES
    // ------------------------------------------------------------------
    console.log('--- Setting Up Phase 4 Test Fixtures ---');

    // 1. Super Admin Token
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminLoginJson: any = await adminLoginRes.json();
    const adminToken = adminLoginJson.data.token;
    assert(adminLoginRes.status === 200 && !!adminToken, 'Super Admin test login succeeds');

    // 2. Technician User & Token
    const techUser = await prisma.user.create({
      data: {
        username: `tech_${uniqueTag}`,
        name: 'Technician P4 Test',
        password: await hashPassword('TechPassword2026'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-P4-${uniqueTag.toUpperCase()}`,
            specialization: 'Smart Wiring & IoT',
            serviceArea: 'Jakarta Barat',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
    });
    createdUserIds.push(techUser.id);

    const techLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: `tech_${uniqueTag}`, password: 'TechPassword2026' }),
    });
    const techLoginJson: any = await techLoginRes.json();
    const techToken = techLoginJson.data.token;
    assert(techLoginRes.status === 200 && !!techToken, 'Technician test login succeeds');

    // 3. Customer A & Customer B Users & Tokens
    const custAReg = await AuthService.registerCustomer({
      name: 'Customer A - Budi Santoso',
      email: `cust.a.${uniqueTag}@example.com`,
      password: 'Password2026',
    });
    createdUserIds.push(custAReg.user.id);
    const custAToken = custAReg.token;
    const custAProfileId = custAReg.user.customerProfile!.id;

    const custBReg = await AuthService.registerCustomer({
      name: 'Customer B - Siti Nurhaliza',
      email: `cust.b.${uniqueTag}@example.com`,
      password: 'Password2026',
    });
    createdUserIds.push(custBReg.user.id);
    const custBToken = custBReg.token;
    const custBProfileId = custBReg.user.customerProfile!.id;

    // 4. Create House A1 (ACTIVE) with Floor, FloorPlan, Room, Device, AutomationRule
    const houseA1 = await prisma.house.create({
      data: {
        name: 'Customer A - Villa Mawar (ACTIVE)',
        customerId: custAProfileId,
        setupStatus: 'ACTIVE',
        propertyType: 'VILLA',
      },
    });
    createdHouseIds.push(houseA1.id);

    const floorA1 = await prisma.floor.create({
      data: {
        houseId: houseA1.id,
        name: 'Lantai 1',
        levelNumber: 1,
      },
    });
    createdFloorIds.push(floorA1.id);

    const floorPlanA1 = await prisma.floorPlan.create({
      data: {
        floorId: floorA1.id,
        name: 'Floor Plan A1',
        viewBoxWidth: 800,
        viewBoxHeight: 600,
      },
    });
    createdFloorPlanIds.push(floorPlanA1.id);

    const roomA1 = await prisma.room.create({
      data: {
        floorId: floorA1.id,
        name: 'Ruang Tamu A1',
      },
    });
    createdRoomIds.push(roomA1.id);

    const deviceA1 = await prisma.device.create({
      data: {
        houseId: houseA1.id,
        floorId: floorA1.id,
        floorPlanId: floorPlanA1.id,
        roomId: roomA1.id,
        name: 'Smart Light A1',
        type: 'LIGHT',
        status: 'ON',
        integrationStatus: 'SIMULATED',
      },
    });
    createdDeviceIds.push(deviceA1.id);

    const ruleA1 = await AutomationService.createRule({
      houseId: houseA1.id,
      name: 'Auto Turn Off Light A1',
      conditions: [{ type: 'DEVICE_STATE', deviceId: deviceA1.id, property: 'status', operator: '==', value: 'ON' }],
      actions: [{ deviceId: deviceA1.id, commandType: 'SET_POWER', payload: { power: false } }],
    });
    createdRuleIds.push(ruleA1.id);

    // 5. Create House A2 (DRAFT) for Customer A
    const houseA2 = await prisma.house.create({
      data: {
        name: 'Customer A - Rumah Kebun (DRAFT)',
        customerId: custAProfileId,
        setupStatus: 'DRAFT',
        propertyType: 'HOUSE',
      },
    });
    createdHouseIds.push(houseA2.id);

    // 6. Create House B1 (ACTIVE) with Floor, FloorPlan, Room, Device, AutomationRule
    const houseB1 = await prisma.house.create({
      data: {
        name: 'Customer B - Apartemen Sentosa (ACTIVE)',
        customerId: custBProfileId,
        setupStatus: 'ACTIVE',
        propertyType: 'APARTMENT',
      },
    });
    createdHouseIds.push(houseB1.id);

    const floorB1 = await prisma.floor.create({
      data: {
        houseId: houseB1.id,
        name: 'Lantai 12',
        levelNumber: 1,
      },
    });
    createdFloorIds.push(floorB1.id);

    const floorPlanB1 = await prisma.floorPlan.create({
      data: {
        floorId: floorB1.id,
        name: 'Floor Plan B1',
        viewBoxWidth: 700,
        viewBoxHeight: 500,
      },
    });
    createdFloorPlanIds.push(floorPlanB1.id);

    const roomB1 = await prisma.room.create({
      data: {
        floorId: floorB1.id,
        name: 'Kamar Utama B1',
      },
    });
    createdRoomIds.push(roomB1.id);

    const deviceB1 = await prisma.device.create({
      data: {
        houseId: houseB1.id,
        floorId: floorB1.id,
        floorPlanId: floorPlanB1.id,
        roomId: roomB1.id,
        name: 'AC Kamar B1',
        type: 'AIR_CONDITIONER',
        status: 'ON',
        integrationStatus: 'SIMULATED',
      },
    });
    createdDeviceIds.push(deviceB1.id);

    const ruleB1 = await AutomationService.createRule({
      houseId: houseB1.id,
      name: 'Cool Down AC B1',
      conditions: [{ type: 'DEVICE_STATE', deviceId: deviceB1.id, property: 'status', operator: '==', value: 'ON' }],
      actions: [{ deviceId: deviceB1.id, commandType: 'SET_TEMPERATURE', payload: { temperature: 22 } }],
    });
    createdRuleIds.push(ruleB1.id);

    // 7. Create Staged Properties for State-Gated Verification
    const houseSurveying = await prisma.house.create({
      data: { name: 'Surveying House', customerId: custAProfileId, setupStatus: 'SURVEYING' },
    });
    createdHouseIds.push(houseSurveying.id);

    const houseConfiguring = await prisma.house.create({
      data: { name: 'Configuring House', customerId: custAProfileId, setupStatus: 'CONFIGURING' },
    });
    createdHouseIds.push(houseConfiguring.id);

    const houseTesting = await prisma.house.create({
      data: { name: 'Testing House', customerId: custAProfileId, setupStatus: 'TESTING' },
    });
    createdHouseIds.push(houseTesting.id);

    const houseReady = await prisma.house.create({
      data: { name: 'Ready For Handover House', customerId: custAProfileId, setupStatus: 'READY_FOR_HANDOVER' },
    });
    createdHouseIds.push(houseReady.id);

    const houseArchived = await prisma.house.create({
      data: { name: 'Archived House', customerId: custAProfileId, setupStatus: 'ARCHIVED' },
    });
    createdHouseIds.push(houseArchived.id);

    console.log('Fixtures established successfully.\n');

    // ------------------------------------------------------------------
    // SCENARIO 1: Customer A can access their own Property A1
    // ------------------------------------------------------------------
    console.log('--- Scenario 1: Customer A can access their own Property A1 ---');
    {
      const res = await fetch(`${baseUrl}/api/houses/${houseA1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const json: any = await res.json();
      assert(res.status === 200 && json.success && json.data.id === houseA1.id, 'Customer A accesses own Property A1 (200 OK)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 2: Customer A can access summary data for Property A2 (multi-property customer)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 2: Customer A can access summary data for Property A2 ---');
    {
      const res = await fetch(`${baseUrl}/api/houses`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const json: any = await res.json();
      const hasA1 = json.data?.some((h: any) => h.id === houseA1.id);
      const hasA2 = json.data?.some((h: any) => h.id === houseA2.id);
      assert(res.status === 200 && hasA1 && hasA2, 'Customer A receives summary list containing both A1 and A2');
    }

    // ------------------------------------------------------------------
    // SCENARIO 3: Customer A CANNOT access Customer B\'s Property B1 (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 3: Customer A CANNOT access Customer B Property B1 ---');
    {
      const res = await fetch(`${baseUrl}/api/houses/${houseB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const json: any = await res.json();
      assert(res.status === 403, `Customer A denied access to House B1 with HTTP 403 (${json.message || json.error})`);
    }

    // ------------------------------------------------------------------
    // SCENARIO 4: Customer B CANNOT access Customer A\'s Property A1 (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 4: Customer B CANNOT access Customer A Property A1 ---');
    {
      const res = await fetch(`${baseUrl}/api/houses/${houseA1.id}`, {
        headers: { Authorization: `Bearer ${custBToken}` },
      });
      assert(res.status === 403, 'Customer B denied access to House A1 with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIO 5: Customer B CANNOT access Customer A\'s Property A2 (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 5: Customer B CANNOT access Customer A Property A2 ---');
    {
      const res = await fetch(`${baseUrl}/api/houses/${houseA2.id}`, {
        headers: { Authorization: `Bearer ${custBToken}` },
      });
      assert(res.status === 403, 'Customer B denied access to House A2 with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIO 6: Changing houseId in URL or body does not bypass ownership check
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 6: IDOR Protection (houseId in body/query/URL) ---');
    {
      // Try to create automation rule in House B1 using Customer A credentials
      const ruleRes = await fetch(`${baseUrl}/api/automations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({
          houseId: houseB1.id,
          name: 'IDOR Malicious Rule',
          conditions: [{ type: 'DEVICE_STATE', deviceId: deviceA1.id, property: 'status', operator: '==', value: 'ON' }],
          actions: [{ deviceId: deviceA1.id, commandType: 'SET_POWER', payload: {} }],
        }),
      });
      assert(ruleRes.status === 403, 'Creating automation in foreign houseId blocked with HTTP 403');

      // Try to query foreign customerId in /api/houses query parameter
      const listForeignRes = await fetch(`${baseUrl}/api/houses?customerId=${custBProfileId}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(listForeignRes.status === 403, 'Querying foreign customerId in /api/houses blocked with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIO 7: Customer cannot access another customer\'s room, device, floor plan, automation, or dashboard
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 7: Customer cannot access foreign resources by ID ---');
    {
      const roomRes = await fetch(`${baseUrl}/api/rooms/${roomB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(roomRes.status === 403, 'Access to Room B1 denied to Customer A with HTTP 403');

      const devRes = await fetch(`${baseUrl}/api/devices/${deviceB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(devRes.status === 403, 'Access to Device B1 denied to Customer A with HTTP 403');

      const devStateRes = await fetch(`${baseUrl}/api/devices/${deviceB1.id}/state`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(devStateRes.status === 403, 'Access to Device B1 state denied to Customer A with HTTP 403');

      const fpRes = await fetch(`${baseUrl}/api/floor-plans/${floorPlanB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(fpRes.status === 403, 'Access to FloorPlan B1 denied to Customer A with HTTP 403');

      const ruleRes = await fetch(`${baseUrl}/api/automations/${ruleB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(ruleRes.status === 403, 'Access to AutomationRule B1 denied to Customer A with HTTP 403');

      const dashRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(dashRes.status === 403, 'Access to Dashboard for House B1 denied to Customer A with HTTP 403');

      // Direct device control attempt by Customer A on Customer B's device (HTTP 403)
      const devControlRes = await fetch(`${baseUrl}/api/devices/${deviceB1.id}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ commandType: 'SET_POWER', payload: { power: false } }),
      });
      assert(devControlRes.status === 403, 'Controlling Device B1 denied to Customer A with HTTP 403');

      // Dashboard device control attempt by Customer A on Customer B's device (HTTP 403)
      const dashDevControlRes = await fetch(`${baseUrl}/api/dashboard/devices/${deviceB1.id}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ commandType: 'SET_POWER', payload: { power: false } }),
      });
      assert(dashDevControlRes.status === 403, 'Dashboard control of Device B1 denied to Customer A with HTTP 403');

      // Modifying Customer B's automation rule by Customer A (HTTP 403)
      const rulePutRes = await fetch(`${baseUrl}/api/automations/${ruleB1.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ name: 'Hacked Rule Name' }),
      });
      assert(rulePutRes.status === 403, 'Modifying AutomationRule B1 denied to Customer A with HTTP 403');

      // Deleting Customer B's automation rule by Customer A (HTTP 403)
      const ruleDelRes = await fetch(`${baseUrl}/api/automations/${ruleB1.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(ruleDelRes.status === 403, 'Deleting AutomationRule B1 denied to Customer A with HTTP 403');

      // Toggling Customer B's automation rule by Customer A (HTTP 403)
      const ruleToggleRes = await fetch(`${baseUrl}/api/automations/${ruleB1.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ enabled: false }),
      });
      assert(ruleToggleRes.status === 403, 'Toggling AutomationRule B1 denied to Customer A with HTTP 403');

      // Testing Customer B's automation rule by Customer A (HTTP 403)
      const ruleTestRes = await fetch(`${baseUrl}/api/automations/${ruleB1.id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(ruleTestRes.status === 403, 'Testing AutomationRule B1 denied to Customer A with HTTP 403');

      // Modifying Customer B's room by Customer A (HTTP 403)
      const roomPatchRes = await fetch(`${baseUrl}/api/rooms/${roomB1.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ name: 'Hacked Room Name' }),
      });
      assert(roomPatchRes.status === 403, 'Modifying Room B1 denied to Customer A with HTTP 403');

      // Deleting Customer B's room by Customer A (HTTP 403)
      const roomDelRes = await fetch(`${baseUrl}/api/rooms/${roomB1.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(roomDelRes.status === 403, 'Deleting Room B1 denied to Customer A with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIOS 8-12: Customer cannot access operational data for non-ACTIVE states
    // ------------------------------------------------------------------
    console.log('\n--- Scenarios 8-12: State-Gated Operational Data Access (Non-ACTIVE States) ---');
    {
      // 8: DRAFT
      const draftRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseA2.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(draftRes.status === 403, 'Scenario 8: DRAFT property operational access blocked (HTTP 403)');

      // 9: SURVEYING
      const surveyRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseSurveying.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(surveyRes.status === 403, 'Scenario 9: SURVEYING property operational access blocked (HTTP 403)');

      // 10: CONFIGURING
      const configRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseConfiguring.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(configRes.status === 403, 'Scenario 10: CONFIGURING property operational access blocked (HTTP 403)');

      // 11: TESTING
      const testRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseTesting.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(testRes.status === 403, 'Scenario 11: TESTING property operational access blocked (HTTP 403)');

      // 12: READY_FOR_HANDOVER
      const readyRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseReady.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(readyRes.status === 403, 'Scenario 12: READY_FOR_HANDOVER property operational access blocked (HTTP 403)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 13: Customer CAN access operational data for Property with status ACTIVE
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 13: Customer CAN access operational data for ACTIVE property ---');
    {
      const dashRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseA1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const dashJson: any = await dashRes.json();
      assert(dashRes.status === 200 && dashJson.success, 'Scenario 13: Dashboard accessible for ACTIVE property');

      const devStateRes = await fetch(`${baseUrl}/api/devices/${deviceA1.id}/state`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(devStateRes.status === 200, 'Scenario 13: Device state accessible for ACTIVE property');
    }

    // ------------------------------------------------------------------
    // SCENARIO 14: Customer cannot access operational data for Property with status ARCHIVED (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 14: ARCHIVED property operational access blocked ---');
    {
      const archRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseArchived.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(archRes.status === 403, 'Scenario 14: ARCHIVED property operational access blocked (HTTP 403)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 15: Customer cannot access another customer\'s ACTIVE property
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 15: Customer cannot access foreign ACTIVE property ---');
    {
      const devRes = await fetch(`${baseUrl}/api/devices/${deviceB1.id}/state`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(devRes.status === 403, 'Customer A cannot read device state on Customer B active property (HTTP 403)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 16: Customer & Technician CANNOT create a standalone property via POST /api/houses (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 16: Disallow standalone property creation for non-admin ---');
    {
      const custPostRes = await fetch(`${baseUrl}/api/houses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({ name: 'Rogue Customer House' }),
      });
      assert(custPostRes.status === 403, 'Customer POST /api/houses returns HTTP 403 Forbidden');

      const techPostRes = await fetch(`${baseUrl}/api/houses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${techToken}`,
        },
        body: JSON.stringify({ name: 'Rogue Technician House' }),
      });
      assert(techPostRes.status === 403, 'Technician POST /api/houses returns HTTP 403 Forbidden');
    }

    // ------------------------------------------------------------------
    // SCENARIO 17: Super Admin retains access to all properties regardless of status or ownership
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 17: Super Admin omniscient administrative access ---');
    {
      const adminA1Res = await fetch(`${baseUrl}/api/houses/${houseA1.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminA2Res = await fetch(`${baseUrl}/api/houses/${houseA2.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminB1Res = await fetch(`${baseUrl}/api/houses/${houseB1.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminDraftDash = await fetch(`${baseUrl}/api/dashboard?houseId=${houseA2.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert(
        adminA1Res.status === 200 && adminA2Res.status === 200 && adminB1Res.status === 200,
        'Super Admin can view houses across all customers'
      );
      assert(adminDraftDash.status === 200, 'Super Admin can view dashboard of non-ACTIVE / DRAFT property');
    }

    // ------------------------------------------------------------------
    // SCENARIO 18: Technician without assignment CANNOT access property-scoped operational data (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 18: Technician without assignment blocked (HTTP 403) ---');
    {
      const techDash = await fetch(`${baseUrl}/api/dashboard?houseId=${houseA1.id}`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      assert(techDash.status === 403, 'Technician without assignment denied dashboard access (HTTP 403)');

      const techDevState = await fetch(`${baseUrl}/api/devices/${deviceA1.id}/state`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      assert(techDevState.status === 403, 'Technician without assignment denied device state access (HTTP 403)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 19: Customer CANNOT access internal survey routes (HTTP 403)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 19: Customer cannot access internal survey routes ---');
    {
      const custSurveyRes = await fetch(`${baseUrl}/api/houses/${houseA1.id}/surveys`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(custSurveyRes.status === 403, 'Customer accessing /surveys returns HTTP 403 Forbidden');

      const adminSurveyRes = await fetch(`${baseUrl}/api/houses/${houseA1.id}/surveys`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(adminSurveyRes.status === 200, 'Super Admin accessing /surveys returns HTTP 200 OK');
    }

    // ------------------------------------------------------------------
    // SCENARIO 20: Missing or invalid ownership is safely denied
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 20: Missing or unassigned property safely denied ---');
    {
      // Valid format UUID v4 that does not exist in DB -> returns 404
      const nonExistentUuid = 'a0000000-0000-4000-8000-000000000000';
      const notFoundRes = await fetch(`${baseUrl}/api/houses/${nonExistentUuid}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(notFoundRes.status === 404, 'Non-existent UUID v4 safely returns HTTP 404 (not 500)');

      // Unassigned property (customerId = null) -> customer access safely denied (403)
      const orphanHouse = await prisma.house.create({
        data: { name: 'Unassigned Orphan House', customerId: null, setupStatus: 'ACTIVE' },
      });
      createdHouseIds.push(orphanHouse.id);

      const orphanRes = await fetch(`${baseUrl}/api/houses/${orphanHouse.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(orphanRes.status === 403, 'Customer access to unassigned property safely denied with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIO 21: Invalid UUID route parameters return clean validation errors (HTTP 400), not 500
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 21: Invalid UUID route parameter validation (HTTP 400) ---');
    {
      const badHouse = await fetch(`${baseUrl}/api/houses/not-a-uuid`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const badDev = await fetch(`${baseUrl}/api/devices/sql-inject'--/state`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const badRoom = await fetch(`${baseUrl}/api/rooms/invalid-id`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const badFp = await fetch(`${baseUrl}/api/floor-plans/12345`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const badRule = await fetch(`${baseUrl}/api/automations/xyz-bad`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });

      assert(
        badHouse.status === 400 &&
        badDev.status === 400 &&
        badRoom.status === 400 &&
        badFp.status === 400 &&
        badRule.status === 400,
        'All malformed UUID params return HTTP 400 with descriptive error without 500 error'
      );
    }

    // ------------------------------------------------------------------
    // SCENARIO 22: Cross-property resource IDs in requests are detected and rejected (HTTP 400)
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 22: Cross-property resource injection rejected ---');
    {
      // 1. Injected foreign roomId into dashboard devices query
      const crossRoomDash = await fetch(
        `${baseUrl}/api/dashboard/devices?houseId=${houseA1.id}&roomId=${roomB1.id}`,
        {
          headers: { Authorization: `Bearer ${custAToken}` },
        }
      );
      assert(crossRoomDash.status === 400, 'Cross-property roomId in dashboard query rejected with HTTP 400');

      // 2. Injected foreign deviceId into automation rule condition
      const crossDevRule = await fetch(`${baseUrl}/api/automations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${custAToken}`,
        },
        body: JSON.stringify({
          houseId: houseA1.id,
          name: 'Cross Property Injection Test',
          conditions: [
            {
              type: 'DEVICE_STATE',
              deviceId: deviceB1.id, // belongs to Customer B!
              property: 'power',
              operator: '==',
              value: true,
            },
          ],
          actions: [{ deviceId: deviceA1.id, commandType: 'SET_POWER', payload: {} }],
        }),
      });
      assert(crossDevRule.status === 400, 'Cross-property deviceId in rule condition rejected with HTTP 400');
    }

    // ------------------------------------------------------------------
    // SCENARIO 23: Nested resource routes enforce parent property ownership
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 23: Nested resource routes enforce property ownership ---');
    {
      // Customer A tries to access /floors/:floorId/rooms belonging to Customer B's House B1
      const nestedRoomsRes = await fetch(`${baseUrl}/api/floors/${floorB1.id}/rooms`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(nestedRoomsRes.status === 403, 'Foreign nested floor rooms rejected with HTTP 403');

      // Customer A tries to access /floor-plans/:floorPlanId/devices belonging to Customer B's House B1
      const nestedDevRes = await fetch(`${baseUrl}/api/floor-plans/${floorPlanB1.id}/devices`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(nestedDevRes.status === 403, 'Foreign nested floor plan devices rejected with HTTP 403');
    }

    // ------------------------------------------------------------------
    // SCENARIO 24: Dashboard requests without houseId do not fall back to an arbitrary first property
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 24: No unsafe fallback to arbitrary first property ---');
    {
      // Customer A has multiple properties (A1 and A2)
      const multiDashRes = await fetch(`${baseUrl}/api/dashboard`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const multiDashJson: any = await multiDashRes.json();
      assert(
        multiDashRes.status === 400 && multiDashJson.multiple_properties_detected === true,
        'Multi-property customer querying dashboard without houseId receives 400 prompting selection'
      );
    }

    // ------------------------------------------------------------------
    // SCENARIO 25: Customer with multiple properties must specify which property they want to view
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 25: Explicit selection succeeds for multi-property customer ---');
    {
      const explicitDashRes = await fetch(`${baseUrl}/api/dashboard?houseId=${houseA1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(explicitDashRes.status === 200, 'Explicit property selection resolves dashboard successfully (HTTP 200)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 26: Existing Super Admin authentication works normally
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 26: Regression - Super Admin Auth ---');
    {
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const meJson: any = await meRes.json();
      assert(meRes.status === 200 && meJson.data?.role === 'SUPER_ADMIN', 'Super Admin /auth/me returns valid session');
    }

    // ------------------------------------------------------------------
    // SCENARIO 27: Existing 2D Floor Plan engine functions normally
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 27: Regression - 2D Floor Plan Engine ---');
    {
      const fpRes = await fetch(`${baseUrl}/api/floor-plans/${floorPlanA1.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(fpRes.status === 200, '2D Floor Plan engine serves floor plan data without error');
    }

    // ------------------------------------------------------------------
    // SCENARIO 28: Existing 3D Studio functionality is intact
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 28: Regression - 3D Studio Models ---');
    {
      const modelsRes = await fetch(`${baseUrl}/api/house-models`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(modelsRes.status === 200, '3D House Models list endpoint functions normally');
    }

    // ------------------------------------------------------------------
    // SCENARIO 29: IoT simulation engine continues running without errors
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 29: Regression - IoT Simulation Engine ---');
    {
      const simStatus = await fetch(`${baseUrl}/api/simulation/status`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(simStatus.status === 200, 'IoT simulation engine status query succeeds (HTTP 200)');
    }

    // ------------------------------------------------------------------
    // SCENARIO 30: Automation engine rule evaluation continues to operate
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 30: Regression - Automation Engine ---');
    {
      const autoStatus = await fetch(`${baseUrl}/api/automations/status`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(autoStatus.status === 200, 'Automation engine status endpoint responds (HTTP 200)');

      const evalRes = await fetch(`${baseUrl}/api/automations/evaluate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(evalRes.status === 200, 'Manual automation evaluation cycle executes successfully (HTTP 200)');

      // --- Scenario 31: Automation Execution History Access Control ---
      console.log('\n--- Scenario 31: Automation Execution History Access Control ---');
      // 1. Super Admin gets global execution history
      const adminExecRes = await fetch(`${baseUrl}/api/automation-executions`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminExecJson: any = await adminExecRes.json();
      assert(
        adminExecRes.status === 200 && Array.isArray(adminExecJson.data) && adminExecJson.data.length >= 2,
        'Super Admin can view global automation execution history (contains both houses)'
      );

      // 2. Super Admin filtered by houseId
      const adminFilteredRes = await fetch(`${baseUrl}/api/automation-executions?houseId=${houseA1.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminFilteredJson: any = await adminFilteredRes.json();
      assert(
        adminFilteredRes.status === 200 &&
        adminFilteredJson.data.every((e: any) => e.rule?.houseId === houseA1.id),
        'Super Admin can filter automation executions by houseId'
      );

      // 3. Customer A can access their own active property execution history
      const custAExecRes = await fetch(`${baseUrl}/api/automation-executions`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      const custAExecJson: any = await custAExecRes.json();
      assert(
        custAExecRes.status === 200 &&
        Array.isArray(custAExecJson.data) &&
        custAExecJson.data.length > 0 &&
        custAExecJson.data.every((e: any) => e.rule?.houseId === houseA1.id),
        'Customer A receives execution history strictly scoped to their own ACTIVE property (zero foreign leaks)'
      );

      // 4. Customer A explicitly queries houseA1.id
      const custAFilteredRes = await fetch(`${baseUrl}/api/automation-executions?houseId=${houseA1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(custAFilteredRes.status === 200, 'Customer A can query execution history for own ACTIVE house');

      // 5. Customer A CANNOT access Customer B execution history (403 Forbidden)
      const custAForeignRes = await fetch(`${baseUrl}/api/automation-executions?houseId=${houseB1.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(custAForeignRes.status === 403, 'Customer A querying Customer B execution history blocked (HTTP 403)');

      // 6. Customer A CANNOT access execution history of non-ACTIVE / DRAFT house (403 Forbidden)
      const custADraftRes = await fetch(`${baseUrl}/api/automation-executions?houseId=${houseA2.id}`, {
        headers: { Authorization: `Bearer ${custAToken}` },
      });
      assert(custADraftRes.status === 403, 'Customer A querying DRAFT house execution history blocked (HTTP 403)');

      // 7. Technician denied global execution history
      const techExecRes = await fetch(`${baseUrl}/api/automation-executions`, {
        headers: { Authorization: `Bearer ${techToken}` },
      });
      assert(techExecRes.status === 403, 'Technician access to automation execution history blocked (HTTP 403)');
    }

  } finally {
    // ------------------------------------------------------------------
    // CLEANUP TEMPORARY TEST DATA
    // ------------------------------------------------------------------
    console.log('\n--- Cleaning Up Ephemeral Test Fixtures ---');
    if (createdRuleIds.length > 0) {
      await prisma.automationRule.deleteMany({ where: { id: { in: createdRuleIds } } });
    }
    if (createdDeviceIds.length > 0) {
      await prisma.device.deleteMany({ where: { id: { in: createdDeviceIds } } });
    }
    if (createdRoomIds.length > 0) {
      await prisma.room.deleteMany({ where: { id: { in: createdRoomIds } } });
    }
    if (createdFloorPlanIds.length > 0) {
      await prisma.floorPlan.deleteMany({ where: { id: { in: createdFloorPlanIds } } });
    }
    if (createdFloorIds.length > 0) {
      await prisma.floor.deleteMany({ where: { id: { in: createdFloorIds } } });
    }
    if (createdHouseIds.length > 0) {
      await prisma.house.deleteMany({ where: { id: { in: createdHouseIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    console.log('Cleanup finished.');
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 4 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('❌ Unhandled Phase 4 test runner error:', err);
  process.exit(1);
});
