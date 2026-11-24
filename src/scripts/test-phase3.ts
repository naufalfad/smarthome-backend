import { PrismaClient } from '@prisma/client';
import http from 'http';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 3 AUTOMATED VERIFICATION SUITE');
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

  try {
    // 1. Verify Database & Retrieve Sample Model
    const models = await prisma.houseModel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    assert(models.length > 0, 'Database contains at least one house model', `Found ${models.length} models`);

    const model = models[0];
    console.log(`ℹ️ Testing with Model: "${model.name}" (ID: ${model.id})`);

    // 2. Verify GLB File on disk
    const filePath = path.resolve(process.cwd(), model.filePath);
    const fileExists = fs.existsSync(filePath);
    assert(fileExists, 'GLB model file exists on disk', filePath);

    // 3. Verify Metadata & Node Graph
    const meta: any = model.modelMetadata;
    assert(!!meta, 'Model metadata JSON exists in database');
    assert(Array.isArray(meta?.allNodesFlat) && meta.allNodesFlat.length > 0, 'Metadata contains flat node array');
    assert(Array.isArray(meta?.nodeTree) && meta.nodeTree.length > 0, 'Metadata contains hierarchical node tree');

    // 4. Verify Spatial Hierarchy & Anchor Detection
    const flatNodes: any[] = meta?.allNodesFlat || [];
    const rooms = flatNodes.filter((n) => n.classification === 'ROOM' || n.name.startsWith('ROOM_'));
    const devices = flatNodes.filter((n) => n.classification === 'OBJ' || n.name.startsWith('OBJ_'));
    const anchors = flatNodes.filter((n) => n.isAnchor || n.name.startsWith('ANCHOR_'));
    const floors = flatNodes.filter((n) => n.classification === 'FLOOR' || n.name.startsWith('FLOOR_'));

    assert(rooms.length > 0, `Rooms detected in scene graph (${rooms.length} rooms found)`, rooms.map((r) => r.name).join(', '));
    assert(devices.length > 0, `Device objects detected (${devices.length} objects found)`, devices.map((d) => d.name).join(', '));
    assert(anchors.length > 0, `IoT Anchors detected as Empty Objects (${anchors.length} anchors found)`, anchors.map((a) => a.name).join(', '));
    assert(floors.length > 0, `Floors detected in scene graph (${floors.length} floors found)`, floors.map((f) => f.name).join(', '));

    // 5. Test Hierarchy Traversal Logic
    // Every anchor should belong to a room or floor in a proper dollhouse
    const anchor = anchors[0];
    if (anchor) {
      assert(anchor.isEmpty === true, `Anchor '${anchor.name}' is verified as an Empty Object (no mesh)`);
      assert(Array.isArray(anchor.transform?.position), `Anchor '${anchor.name}' has valid 3D transform coordinates`);
    }

    // 6. Verify Frontend Phase 3 Components exist
    const frontendBase = path.resolve(process.cwd(), '../frontend/src');
    const requiredFiles = [
      'components/viewer/DollhouseViewer.tsx',
      'components/viewer/SceneExplorer.tsx',
      'components/viewer/ObjectInspector.tsx',
      'components/viewer/ViewerToolbar.tsx',
      'components/viewer/AnchorMarker.tsx',
      'types/scene-interaction.ts',
      'lib/scene-hierarchy.ts',
      'pages/model-library/ModelDetailPage.tsx',
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(frontendBase, relPath);
      const exists = fs.existsSync(fullPath);
      assert(exists, `Phase 3 Frontend file exists: ${relPath}`);
    }

    console.log('\n====================================================');
    console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal error in Phase 3 test suite:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase3Tests();

