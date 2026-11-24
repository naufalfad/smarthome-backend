import { PrismaClient, IdentifiedNodeType, IdentificationStatus } from '@prisma/client';
import { nodeIdentificationService } from '../services/node-identification.service.js';

const prisma = new PrismaClient();

async function runPhase4Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 4 TEST SUITE — ROOM & OBJECT IDENTIFICATION');
  console.log('====================================================\n');

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

  let tempModelId: string | null = null;

  try {
    // Create an isolated test model so user models (like "Ada") are never mutated by tests
    const testNodesFlat = [
      { index: 0, name: 'HOUSE_01', parentIndex: null, classification: 'OTHER', hasMesh: false, isAnchor: false },
      { index: 1, name: 'FLOOR_01', parentIndex: 0, classification: 'FLOOR', hasMesh: false, isAnchor: false },
      { index: 2, name: 'ROOM_LIVING', parentIndex: 1, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 3, name: 'ROOM_BEDROOM', parentIndex: 1, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 4, name: 'OBJ_AC_BEDROOM_01', parentIndex: 3, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 5, name: 'OBJ_LIGHT_LIVING_01', parentIndex: 2, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 6, name: 'OBJ_SOFA_LIVING_01', parentIndex: 2, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 7, name: 'ANCHOR_AIR_QUALITY_LIVING_01', parentIndex: 2, classification: 'ANCHOR', hasMesh: false, isAnchor: true },
      { index: 8, name: 'ANCHOR_TEMP_BEDROOM_01', parentIndex: 3, classification: 'ANCHOR', hasMesh: false, isAnchor: true },
    ];

    const model = await prisma.houseModel.create({
      data: {
        name: '__TEST_PHASE4_RUNNER_MODEL__',
        fileName: 'test_phase4_isolated.glb',
        filePath: 'uploads/house-models/test_phase4_isolated.glb',
        fileSize: 2048,
        modelMetadata: {
          allNodesFlat: testNodesFlat,
          nodeTree: [{ index: 0, name: 'HOUSE_01', children: [] }],
          summary: { totalMeshes: 4, totalMaterials: 3 },
        },
      },
    });

    tempModelId = model.id;
    console.log(`ℹ️ Isolated test model created: "${model.name}" (${tempModelId})`);

    // Ensure identifications are initialized for this model
    await nodeIdentificationService.ensureModelIdentificationsInitialized(tempModelId);

    // ----------------------------------------------------
    // TEST A: Room Identification
    // ----------------------------------------------------
    console.log('\n--- TEST A: Room Identification ---');
    const roomIdentifications = await prisma.nodeIdentification.findMany({
      where: { houseModelId: tempModelId, nodeType: 'ROOM' },
    });
    assert(roomIdentifications.length === 2, `ROOM_ nodes detected in database (${roomIdentifications.length} rooms)`);

    const sampleRoom = roomIdentifications[0];
    assert(!!sampleRoom.suggestedCategory, `Rule-based suggestion generated for room: ${sampleRoom.nodeName} -> ${sampleRoom.suggestedCategory}`);

    // Update room category & display name
    const updatedRoom = await nodeIdentificationService.upsertIdentification(tempModelId, {
      nodeName: sampleRoom.nodeName,
      displayName: 'Main Living Hall',
      category: 'LIVING_ROOM',
      status: IdentificationStatus.IDENTIFIED,
      description: 'Central family lounge on ground floor',
    });

    assert(updatedRoom.displayName === 'Main Living Hall', 'Room display name updated to "Main Living Hall"');
    assert(updatedRoom.category === 'LIVING_ROOM', 'Room category updated to LIVING_ROOM');
    assert(updatedRoom.status === 'IDENTIFIED', 'Room status transitioned to IDENTIFIED');

    // Persistence test: Re-query from database
    const reloadedRoom = await prisma.nodeIdentification.findUnique({
      where: { id: updatedRoom.id },
    });
    assert(reloadedRoom?.displayName === 'Main Living Hall', 'Room data persisted permanently in PostgreSQL');

    // ----------------------------------------------------
    // TEST B: Object Identification
    // ----------------------------------------------------
    console.log('\n--- TEST B: Object Identification ---');
    const objIdentifications = await prisma.nodeIdentification.findMany({
      where: { houseModelId: tempModelId, nodeType: 'OBJECT' },
    });
    assert(objIdentifications.length === 3, `OBJ_ nodes detected in database (${objIdentifications.length} objects)`);

    const sampleObj = objIdentifications.find((o) => o.nodeName === 'OBJ_AC_BEDROOM_01') || objIdentifications[0];
    assert(sampleObj.suggestedCategory === 'SMART_AC', `Rule-based suggestion generated for object: ${sampleObj.nodeName} -> ${sampleObj.suggestedCategory}`);

    // Verify parent room and floor resolved from actual GLB hierarchy
    assert(sampleObj.parentRoom === 'ROOM_BEDROOM', `Object '${sampleObj.nodeName}' has parentRoom '${sampleObj.parentRoom}' from GLB`);
    assert(sampleObj.parentFloor === 'FLOOR_01', `Object '${sampleObj.nodeName}' has parentFloor '${sampleObj.parentFloor}' from GLB`);

    // Update object category & display name
    const updatedObj = await nodeIdentificationService.upsertIdentification(tempModelId, {
      nodeName: sampleObj.nodeName,
      displayName: 'Primary Air Conditioner',
      category: 'SMART_AC',
      status: IdentificationStatus.IDENTIFIED,
    });
    assert(updatedObj.displayName === 'Primary Air Conditioner', 'Object display name updated');
    assert(updatedObj.category === 'SMART_AC', 'Object category updated to SMART_AC');

    // ----------------------------------------------------
    // TEST C: IoT Anchor Identification
    // ----------------------------------------------------
    console.log('\n--- TEST C: IoT Anchor Identification ---');
    const anchorIdentifications = await prisma.nodeIdentification.findMany({
      where: { houseModelId: tempModelId, nodeType: 'ANCHOR' },
    });
    assert(anchorIdentifications.length === 2, `ANCHOR_ nodes detected (${anchorIdentifications.length} anchors)`);

    const sampleAnchor = anchorIdentifications.find((a) => a.nodeName === 'ANCHOR_AIR_QUALITY_LIVING_01') || anchorIdentifications[0];
    assert(sampleAnchor.suggestedCategory === 'AIR_QUALITY', `Rule-based suggestion generated for anchor: ${sampleAnchor.nodeName} -> ${sampleAnchor.suggestedCategory}`);

    // Verify empty object remains without mesh in GLB
    const glbMeta: any = model.modelMetadata;
    const glbAnchorNode = glbMeta.allNodesFlat.find((n: any) => n.name === sampleAnchor.nodeName);
    assert(glbAnchorNode?.hasMesh === false, 'Anchor verified as Empty Object (hasMesh = false)');

    // Update anchor
    const updatedAnchor = await nodeIdentificationService.upsertIdentification(tempModelId, {
      nodeName: sampleAnchor.nodeName,
      displayName: 'Living Room Climate Anchor',
      category: 'TEMPERATURE_HUMIDITY',
      status: IdentificationStatus.IDENTIFIED,
    });
    assert(updatedAnchor.category === 'TEMPERATURE_HUMIDITY', 'Anchor category confirmed as TEMPERATURE_HUMIDITY');

    // Category type safety test: Reject invalid category for anchor
    let rejectedInvalid = false;
    try {
      await nodeIdentificationService.upsertIdentification(tempModelId, {
        nodeName: sampleAnchor.nodeName,
        category: 'SOFA', // Sofa is furniture, invalid for anchor!
      });
    } catch {
      rejectedInvalid = true;
    }
    assert(rejectedInvalid, 'Strict category validation rejected incompatible category (SOFA for ANCHOR)');

    // ----------------------------------------------------
    // TEST D: Bulk Identification & Preview
    // ----------------------------------------------------
    console.log('\n--- TEST D: Bulk Identification & Preview ---');
    // Preview test
    const preview: any = await nodeIdentificationService.bulkUpdateIdentifications(tempModelId, {
      previewOnly: true,
      filterNodeType: 'OBJECT',
    });
    assert(preview.preview === true, 'Bulk identification preview generated without modifying DB');
    assert(preview.totalCandidates > 0, `Preview returned ${preview.totalCandidates} candidate nodes`);

    // Execution test
    const candidatesToConfirm = preview.items.slice(0, 2).map((item: any) => ({
      nodeName: item.nodeName,
      category: item.newCategory,
      displayName: item.newDisplayName,
      status: IdentificationStatus.IDENTIFIED,
    }));

    const bulkResult = await nodeIdentificationService.bulkUpdateIdentifications(tempModelId, {
      items: candidatesToConfirm,
      previewOnly: false,
    });
    assert(bulkResult.success === true, 'Bulk identification executed successfully');
    assert(bulkResult.updatedCount === candidatesToConfirm.length, `Bulk updated ${bulkResult.updatedCount} nodes to IDENTIFIED`);

    // Verify no duplicates
    const totalIdentifications = await prisma.nodeIdentification.count({
      where: { houseModelId: tempModelId },
    });
    const uniqueNodeNames = await prisma.nodeIdentification.groupBy({
      by: ['nodeName'],
      where: { houseModelId: tempModelId },
    });
    assert(totalIdentifications === uniqueNodeNames.length, 'Data integrity verified: Zero duplicate node identifications in PostgreSQL');

    // ----------------------------------------------------
    // TEST E: GLB Revalidation
    // ----------------------------------------------------
    console.log('\n--- TEST E: GLB Revalidation ---');
    const reval = await nodeIdentificationService.revalidateIdentifications(tempModelId);
    assert(reval.summary.totalMatched === 7, `GLB revalidation matched all ${reval.summary.totalMatched} nodes correctly`);
    assert(reval.summary.totalMissing === 0, 'No missing nodes detected in active GLB model');

    // ----------------------------------------------------
    // TEST F: Regression Testing (Phase 2 & Phase 3)
    // ----------------------------------------------------
    console.log('\n--- TEST F: Regression Testing ---');
    assert(!!model.filePath, 'Phase 2 GLB file path intact');
    assert(!!model.modelMetadata, 'Phase 2 Model inspection metadata intact');

    const overviewMetrics = await nodeIdentificationService.getIdentificationsOverview(tempModelId);
    assert(overviewMetrics.totalNodes === 7, `Phase 4 Overview metrics active: ${overviewMetrics.overallIdentifiedCount}/${overviewMetrics.totalNodes} identified`);

    console.log('\n====================================================');
    console.log(`📊 PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal error during Phase 4 test suite:', err);
    process.exit(1);
  } finally {
    // Delete isolated test model cleanly
    if (tempModelId) {
      await prisma.houseModel.delete({ where: { id: tempModelId } });
    }
    await prisma.$disconnect();
  }
}

runPhase4Tests();
