process.env.NODE_ENV = 'test';
import { app } from '../server.js';
import http from 'http';
import { PrismaClient, IdentificationStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function runApiCoverageAudit() {
  console.log('====================================================');
  console.log('🛡️ RUNNING API COVERAGE & VALIDATION AUDIT SUITE');
  console.log('====================================================\n');

  const PORT = 5096;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Auditor test server running on http://localhost:${PORT}`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  let testModelAId: string | null = null;
  let testModelBId: string | null = null;

  try {
    // Setup two isolated test models to test data isolation
    const nodesA = [
      { index: 0, name: 'HOUSE_A', parentIndex: null, classification: 'OTHER', hasMesh: false, isAnchor: false },
      { index: 1, name: 'ROOM_LIVING', parentIndex: 0, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 2, name: 'OBJ_AC_01', parentIndex: 1, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 3, name: 'ANCHOR_TEMP_01', parentIndex: 1, classification: 'ANCHOR', hasMesh: false, isAnchor: true },
    ];
    const nodesB = [
      { index: 0, name: 'HOUSE_B', parentIndex: null, classification: 'OTHER', hasMesh: false, isAnchor: false },
      { index: 1, name: 'ROOM_BEDROOM', parentIndex: 0, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 2, name: 'OBJ_LIGHT_01', parentIndex: 1, classification: 'OBJ', hasMesh: true, isAnchor: false },
    ];

    const modelA = await prisma.houseModel.create({
      data: {
        name: '__AUDIT_MODEL_A__',
        fileName: 'audit_a.glb',
        filePath: 'uploads/house-models/audit_a.glb',
        fileSize: 1024,
        modelMetadata: { allNodesFlat: nodesA, nodeTree: [{ index: 0, name: 'HOUSE_A', children: [] }] },
      },
    });
    testModelAId = modelA.id;

    const modelB = await prisma.houseModel.create({
      data: {
        name: '__AUDIT_MODEL_B__',
        fileName: 'audit_b.glb',
        filePath: 'uploads/house-models/audit_b.glb',
        fileSize: 1024,
        modelMetadata: { allNodesFlat: nodesB, nodeTree: [{ index: 0, name: 'HOUSE_B', children: [] }] },
      },
    });
    testModelBId = modelB.id;

    const baseUrl = `http://localhost:${PORT}/api/house-models`;

    // ----------------------------------------------------
    // 1. GET Overview
    // ----------------------------------------------------
    console.log('\n--- 1. GET Overview Endpoint ---');
    const resOverview = await fetch(`${baseUrl}/${testModelAId}/identifications/overview`);
    const jsonOverview: any = await resOverview.json();
    assert(resOverview.status === 200, 'GET /overview returns HTTP 200');
    assert(jsonOverview.success === true, 'GET /overview response payload has success: true');
    assert(jsonOverview.data?.rooms?.total === 1, 'Overview reports 1 room for Model A');
    assert(jsonOverview.data?.objects?.total === 1, 'Overview reports 1 object for Model A');
    assert(jsonOverview.data?.anchors?.total === 1, 'Overview reports 1 anchor for Model A');

    // Overview error test: Non-existent HouseModel ID
    const resOverviewBad = await fetch(`${baseUrl}/00000000-0000-0000-0000-000000000000/identifications/overview`);
    assert(resOverviewBad.status >= 400, 'GET /overview with non-existent model ID returns HTTP 4xx/5xx');

    // ----------------------------------------------------
    // 2. GET Tree
    // ----------------------------------------------------
    console.log('\n--- 2. GET Tree Endpoint ---');
    const resTree = await fetch(`${baseUrl}/${testModelAId}/identifications/tree`);
    const jsonTree: any = await resTree.json();
    assert(resTree.status === 200, 'GET /tree returns HTTP 200');
    assert(Array.isArray(jsonTree.data), 'GET /tree returns array tree structure');

    // ----------------------------------------------------
    // 3. GET List with Filters
    // ----------------------------------------------------
    console.log('\n--- 3. GET List with Query Filters ---');
    const resListAll = await fetch(`${baseUrl}/${testModelAId}/identifications`);
    const jsonListAll: any = await resListAll.json();
    assert(resListAll.status === 200, 'GET /identifications returns HTTP 200');
    assert(jsonListAll.data?.length === 3, 'Model A has exactly 3 candidate node identifications');

    // Filter by nodeType=ROOM
    const resListRooms = await fetch(`${baseUrl}/${testModelAId}/identifications?nodeType=ROOM`);
    const jsonListRooms: any = await resListRooms.json();
    assert(jsonListRooms.data?.every((r: any) => r.nodeType === 'ROOM'), 'Filter nodeType=ROOM returns only room nodes');
    assert(jsonListRooms.data?.length === 1, 'Filter nodeType=ROOM returns exactly 1 room');

    // Filter by search query
    const resListSearch = await fetch(`${baseUrl}/${testModelAId}/identifications?search=AC`);
    const jsonListSearch: any = await resListSearch.json();
    assert(jsonListSearch.data?.length === 1 && jsonListSearch.data[0].nodeName === 'OBJ_AC_01', 'Search query matches OBJ_AC_01');

    // ----------------------------------------------------
    // 4. GET Detail by Node
    // ----------------------------------------------------
    console.log('\n--- 4. GET Detail by Node ---');
    const resDetail = await fetch(`${baseUrl}/${testModelAId}/identifications/OBJ_AC_01`);
    const jsonDetail: any = await resDetail.json();
    assert(resDetail.status === 200, 'GET /identifications/:nodeName returns HTTP 200');
    assert(jsonDetail.data?.nodeName === 'OBJ_AC_01', 'Detail returns correct nodeName');
    assert(jsonDetail.data?.parentRoom === 'ROOM_LIVING', 'Detail returns parentRoom = ROOM_LIVING');

    // 404 test for non-existent node
    const resDetailNotFound = await fetch(`${baseUrl}/${testModelAId}/identifications/NON_EXISTENT_NODE`);
    const jsonDetailNotFound: any = await resDetailNotFound.json();
    assert(resDetailNotFound.status === 404, 'GET for non-existent node returns HTTP 404');
    assert(jsonDetailNotFound.success === false, 'Error response has success: false');

    // ----------------------------------------------------
    // 5. POST / PATCH Upsert Identification & Strict Validations
    // ----------------------------------------------------
    console.log('\n--- 5. POST / PATCH Upsert Validations ---');
    // Valid update
    const resUpsertValid = await fetch(`${baseUrl}/${testModelAId}/identifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeName: 'OBJ_AC_01',
        displayName: 'Audited Air Conditioner',
        category: 'SMART_AC',
        status: 'IDENTIFIED',
      }),
    });
    const jsonUpsertValid: any = await resUpsertValid.json();
    assert(resUpsertValid.status === 200, 'POST /identifications valid body returns HTTP 200');
    assert(jsonUpsertValid.data?.displayName === 'Audited Air Conditioner', 'Database displayName updated');
    assert(jsonUpsertValid.data?.status === 'IDENTIFIED', 'Database status updated to IDENTIFIED');

    // Validation: Missing required category
    const resMissingCategory = await fetch(`${baseUrl}/${testModelAId}/identifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeName: 'OBJ_AC_01' }),
    });
    assert(resMissingCategory.status === 400, 'Missing category rejected with HTTP 400');

    // Validation: Node not in GLB
    const resGhostNode = await fetch(`${baseUrl}/${testModelAId}/identifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeName: 'GHOST_OBJECT', category: 'SMART_AC' }),
    });
    assert(resGhostNode.status === 400, 'Node not in GLB rejected with HTTP 400');

    // Validation: Incompatible category for node type (Assigning BEDROOM to OBJ_AC_01)
    const resIncompatibleCat = await fetch(`${baseUrl}/${testModelAId}/identifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeName: 'OBJ_AC_01', category: 'BEDROOM' }),
    });
    assert(resIncompatibleCat.status === 400, 'Incompatible category (Room category for Object) rejected with HTTP 400');

    // Validation: Incompatible category for anchor (Assigning SOFA to ANCHOR_TEMP_01)
    const resIncompatibleAnchor = await fetch(`${baseUrl}/${testModelAId}/identifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeName: 'ANCHOR_TEMP_01', category: 'SOFA' }),
    });
    assert(resIncompatibleAnchor.status === 400, 'Incompatible category (Furniture for Anchor) rejected with HTTP 400');

    // PATCH endpoint check
    const resPatch = await fetch(`${baseUrl}/${testModelAId}/identifications/ROOM_LIVING`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Patched Living Area',
        category: 'LIVING_ROOM',
        status: 'IDENTIFIED',
      }),
    });
    const jsonPatch: any = await resPatch.json();
    assert(resPatch.status === 200, 'PATCH /identifications/:nodeName returns HTTP 200');
    assert(jsonPatch.data?.displayName === 'Patched Living Area', 'PATCH correctly updated displayName');

    // ----------------------------------------------------
    // 6. Bulk Identification: Preview vs Confirmation
    // ----------------------------------------------------
    console.log('\n--- 6. Bulk Preview vs Confirmation ---');
    // Preview: should NOT modify database
    const resBulkPreview = await fetch(`${baseUrl}/${testModelAId}/identifications/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previewOnly: true,
        items: [{ nodeName: 'ANCHOR_TEMP_01', category: 'TEMPERATURE_HUMIDITY', status: 'IDENTIFIED' }],
      }),
    });
    const jsonBulkPreview: any = await resBulkPreview.json();
    assert(resBulkPreview.status === 200, 'POST /bulk preview returns HTTP 200');
    assert(jsonBulkPreview.data?.preview === true, 'Bulk preview reports preview: true');

    // Verify DB was NOT modified by preview
    const anchorBeforeConfirm = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: testModelAId, nodeName: 'ANCHOR_TEMP_01' } },
    });
    assert(anchorBeforeConfirm?.status === 'SUGGESTED', 'Safety confirmed: Bulk preview did NOT modify database state');

    // Confirmation: should modify database
    const resBulkConfirm = await fetch(`${baseUrl}/${testModelAId}/identifications/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previewOnly: false,
        items: [{ nodeName: 'ANCHOR_TEMP_01', category: 'TEMPERATURE_HUMIDITY', status: 'IDENTIFIED' }],
      }),
    });
    const jsonBulkConfirm: any = await resBulkConfirm.json();
    assert(resBulkConfirm.status === 200, 'POST /bulk confirm returns HTTP 200');
    assert(jsonBulkConfirm.data?.updatedCount === 1, 'Bulk confirm reported 1 updated item');

    const anchorAfterConfirm = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: testModelAId, nodeName: 'ANCHOR_TEMP_01' } },
    });
    assert(anchorAfterConfirm?.status === 'IDENTIFIED', 'Database status committed as IDENTIFIED');

    // ----------------------------------------------------
    // 7. GLB Revalidation Endpoint
    // ----------------------------------------------------
    console.log('\n--- 7. GLB Revalidation Endpoint ---');
    const resReval = await fetch(`${baseUrl}/${testModelAId}/identifications/revalidate`, {
      method: 'POST',
    });
    const jsonReval: any = await resReval.json();
    assert(resReval.status === 200, 'POST /revalidate returns HTTP 200');
    assert(jsonReval.data?.summary?.totalMatched === 3, 'POST /revalidate matched all 3 active nodes');

    // ----------------------------------------------------
    // 8. Cross-Model Data Isolation Check
    // ----------------------------------------------------
    console.log('\n--- 8. Cross-Model Data Isolation ---');
    // Ensure Model B is initialized
    await fetch(`${baseUrl}/${testModelBId}/identifications/overview`);

    const resListA = await fetch(`${baseUrl}/${testModelAId}/identifications`);
    const resListB = await fetch(`${baseUrl}/${testModelBId}/identifications`);
    const jsonListA2: any = await resListA.json();
    const jsonListB2: any = await resListB.json();

    const namesA = new Set(jsonListA2.data?.map((i: any) => i.nodeName));
    const namesB = new Set(jsonListB2.data?.map((i: any) => i.nodeName));

    assert(!namesA.has('OBJ_LIGHT_01'), 'Model A does not contain Model B nodes');
    assert(!namesB.has('OBJ_AC_01'), 'Model B does not contain Model A nodes');
    assert(namesB.has('OBJ_LIGHT_01'), 'Model B contains its own isolated nodes');

    console.log('\n====================================================');
    console.log(`📊 API COVERAGE AUDIT: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal error during API coverage audit:', err);
    process.exit(1);
  } finally {
    server.close();
    // Clean up test models
    if (testModelAId) await prisma.houseModel.delete({ where: { id: testModelAId } });
    if (testModelBId) await prisma.houseModel.delete({ where: { id: testModelBId } });
    await prisma.$disconnect();
  }
}

runApiCoverageAudit();

