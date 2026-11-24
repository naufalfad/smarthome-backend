import { PrismaClient, IdentificationStatus } from '@prisma/client';
import { nodeIdentificationService } from '../services/node-identification.service.js';

const prisma = new PrismaClient();

async function runRevalidationEdgeCases() {
  console.log('====================================================');
  console.log('🧪 RUNNING ISOLATED REVALIDATION EDGE-CASE TEST SUITE');
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
    // Setup isolated test model with synthetic scene graph
    const initialNodesFlat = [
      { index: 0, name: 'HOUSE_TEST', parentIndex: null, classification: 'OTHER', hasMesh: false, isAnchor: false },
      { index: 1, name: 'FLOOR_01', parentIndex: 0, classification: 'FLOOR', hasMesh: false, isAnchor: false },
      { index: 2, name: 'ROOM_LIVING', parentIndex: 1, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 3, name: 'ROOM_BEDROOM', parentIndex: 1, classification: 'ROOM', hasMesh: true, isAnchor: false },
      { index: 4, name: 'OBJ_AC_01', parentIndex: 2, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 5, name: 'OBJ_LIGHT_01', parentIndex: 2, classification: 'OBJ', hasMesh: true, isAnchor: false },
      { index: 6, name: 'ANCHOR_TEMP_01', parentIndex: 3, classification: 'ANCHOR', hasMesh: false, isAnchor: true },
    ];

    const tempModel = await prisma.houseModel.create({
      data: {
        name: '__ISOLATED_REVALIDATION_TEST_MODEL__',
        fileName: 'isolated_test_dollhouse.glb',
        filePath: 'uploads/house-models/isolated_test_dollhouse.glb',
        fileSize: 1024,
        modelMetadata: {
          allNodesFlat: initialNodesFlat,
          nodeTree: [],
          summary: { totalMeshes: 3, totalMaterials: 2 },
        },
      },
    });

    tempModelId = tempModel.id;
    console.log(`ℹ️ Created isolated test model ID: ${tempModelId}`);

    // Seed initial identifications
    await nodeIdentificationService.ensureModelIdentificationsInitialized(tempModelId);
    const initialRecords = await prisma.nodeIdentification.findMany({ where: { houseModelId: tempModelId } });
    assert(initialRecords.length === 5, 'Initial identifications initialized (2 rooms, 2 objects, 1 anchor)');

    // ----------------------------------------------------
    // Scenario A: Node Tetap Sama (Unchanged nodes)
    // ----------------------------------------------------
    console.log('\n--- Scenario A: Node Tetap Sama ---');
    const resultA = await nodeIdentificationService.revalidateIdentifications(tempModelId);
    assert(resultA.summary.totalMatched === 5, 'All 5 nodes matched with status MATCHED');
    assert(resultA.summary.totalNew === 0, 'Zero new nodes in Scenario A');
    assert(resultA.summary.totalMissing === 0, 'Zero missing nodes in Scenario A');
    assert(resultA.summary.totalNeedsReview === 0, 'Zero needs review in Scenario A');

    // ----------------------------------------------------
    // Scenario B: Node Baru (New node added to GLB)
    // ----------------------------------------------------
    console.log('\n--- Scenario B: Node Baru Terdeteksi ---');
    // Add OBJ_TV_01 to ROOM_LIVING in GLB metadata
    const nodesWithNew = [
      ...initialNodesFlat,
      { index: 7, name: 'OBJ_TV_01', parentIndex: 2, classification: 'OBJ', hasMesh: true, isAnchor: false },
    ];
    await prisma.houseModel.update({
      where: { id: tempModelId },
      data: { modelMetadata: { allNodesFlat: nodesWithNew, nodeTree: [], summary: {} } },
    });

    const resultB = await nodeIdentificationService.revalidateIdentifications(tempModelId);
    assert(resultB.summary.totalNew === 1, 'Exactly 1 new node detected');
    assert(resultB.details.newNodes.includes('OBJ_TV_01'), 'New node identified as OBJ_TV_01');
    assert(resultB.summary.totalMatched === 5, 'Previous 5 nodes remain MATCHED');

    // Verify database record for new node
    const tvRecord = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: tempModelId, nodeName: 'OBJ_TV_01' } },
    });
    assert(tvRecord !== null, 'OBJ_TV_01 record created in database');
    assert(tvRecord?.revalidationStatus === 'NEW_NODE', 'OBJ_TV_01 has revalidationStatus = NEW_NODE');
    assert(tvRecord?.status === IdentificationStatus.SUGGESTED, 'OBJ_TV_01 initialized in SUGGESTED status');
    assert(tvRecord?.parentRoom === 'ROOM_LIVING', 'OBJ_TV_01 parentRoom correctly resolved as ROOM_LIVING');

    // ----------------------------------------------------
    // Scenario C: Node Dihapus dari GLB (Missing node)
    // ----------------------------------------------------
    console.log('\n--- Scenario C: Node Dihapus dari GLB ---');
    // Remove OBJ_LIGHT_01 from GLB
    const nodesWithoutLight = nodesWithNew.filter((n) => n.name !== 'OBJ_LIGHT_01');
    await prisma.houseModel.update({
      where: { id: tempModelId },
      data: { modelMetadata: { allNodesFlat: nodesWithoutLight, nodeTree: [], summary: {} } },
    });

    const resultC = await nodeIdentificationService.revalidateIdentifications(tempModelId);
    assert(resultC.summary.totalMissing === 1, 'Exactly 1 missing node detected');
    assert(resultC.details.missingNodes.includes('OBJ_LIGHT_01'), 'Missing node identified as OBJ_LIGHT_01');

    // Verify metadata for missing node is PRESERVED, not deleted
    const missingRecord = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: tempModelId, nodeName: 'OBJ_LIGHT_01' } },
    });
    assert(missingRecord !== null, 'Crucial safety check: Missing node was NOT deleted from PostgreSQL');
    assert(missingRecord?.revalidationStatus === 'MISSING_NODE', 'Missing node flagged with revalidationStatus = MISSING_NODE');
    assert(missingRecord?.status === IdentificationStatus.NEEDS_REVIEW, 'Missing node flagged with status = NEEDS_REVIEW');

    // ----------------------------------------------------
    // Scenario D: Node Berpindah Ruangan (Hierarchy change)
    // ----------------------------------------------------
    console.log('\n--- Scenario D: Node Berpindah Ruangan ---');
    // Move OBJ_AC_01 from ROOM_LIVING (parentIndex: 2) to ROOM_BEDROOM (parentIndex: 3)
    const nodesWithMovedAc = nodesWithoutLight.map((n) => {
      if (n.name === 'OBJ_AC_01') {
        return { ...n, parentIndex: 3 };
      }
      return n;
    });
    await prisma.houseModel.update({
      where: { id: tempModelId },
      data: { modelMetadata: { allNodesFlat: nodesWithMovedAc, nodeTree: [], summary: {} } },
    });

    const resultD = await nodeIdentificationService.revalidateIdentifications(tempModelId);
    assert(resultD.summary.totalNeedsReview === 1, 'Exactly 1 node flagged as NEEDS_REVIEW due to hierarchy change');
    assert(
      resultD.details.needsReview.some((item) => item.nodeName === 'OBJ_AC_01'),
      'OBJ_AC_01 flagged in needsReview list'
    );

    const movedRecord = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: tempModelId, nodeName: 'OBJ_AC_01' } },
    });
    assert(movedRecord?.parentRoom === 'ROOM_BEDROOM', 'OBJ_AC_01 parentRoom updated to ROOM_BEDROOM in database');
    assert(movedRecord?.revalidationStatus === 'NEEDS_REVIEW', 'OBJ_AC_01 has revalidationStatus = NEEDS_REVIEW');
    assert(movedRecord?.status === IdentificationStatus.NEEDS_REVIEW, 'OBJ_AC_01 status updated to NEEDS_REVIEW');

    console.log('\n====================================================');
    console.log(`📊 REVALIDATION EDGE-CASE TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal error during revalidation edge-case testing:', err);
    process.exit(1);
  } finally {
    // Clean up temporary model and its cascade relations
    if (tempModelId) {
      console.log(`🧹 Cleaning up temporary test model ${tempModelId}...`);
      await prisma.houseModel.delete({ where: { id: tempModelId } });
      console.log('✅ Temporary test model deleted cleanly.');
    }
    await prisma.$disconnect();
  }
}

runRevalidationEdgeCases();

