import { PrismaClient } from '@prisma/client';
import { FloorPlanService } from '../services/floor-plan.service.js';
import { HouseService } from '../services/house.service.js';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runIntegrityAudit() {
  console.log('====================================================');
  console.log('🛡️ PHASE 2: DATABASE & SPATIAL INTEGRITY AUDIT SUITE');
  console.log('====================================================\n');

  // Setup isolated House for testing
  const house = await HouseService.createHouse({
    name: '__INTEGRITY_TEST_HOUSE__',
    description: 'Temporary house for testing data integrity constraints',
  });
  const floor1 = house.floors[0];
  const floor2 = await HouseService.addFloor(house.id, { name: 'Lantai 2 Test', levelNumber: 2 });

  const plan1 = await FloorPlanService.getPlanByFloorId(floor1.id);
  const plan2 = await FloorPlanService.getPlanByFloorId(floor2.id);

  try {
    // 1. Concurrent Initialization Safety
    console.log('🔒 1. Concurrent Initialization & Unique Constraint');
    const concurrentResults = await Promise.all([
      FloorPlanService.getPlanByFloorId(floor1.id),
      FloorPlanService.getPlanByFloorId(floor1.id),
      FloorPlanService.getPlanByFloorId(floor1.id),
      FloorPlanService.getPlanByFloorId(floor1.id),
      FloorPlanService.getPlanByFloorId(floor1.id),
    ]);
    const allSameId = concurrentResults.every((p) => p.id === plan1.id);
    assert(allSameId, '5 simultaneous concurrent getPlanByFloorId requests returned exact same plan ID without race condition');

    const totalPlansForFloor1 = await prisma.floorPlan.count({ where: { floorId: floor1.id } });
    assert(totalPlansForFloor1 === 1, 'Database strictly holds exactly 1 FloorPlan for floor1 (Unique constraint enforced)');

    // 2. Cross-Floor Room Integrity
    console.log('\n🚪 2. Room Cross-Floor Validation');
    const roomOnFloor1 = await prisma.room.create({
      data: {
        name: 'Master Bedroom Floor 1',
        floorId: floor1.id,
      },
    });

    let crossFloorBlocked = false;
    try {
      await FloorPlanService.createObject(plan2.id, {
        name: 'Bed on Floor 2 linking to Room on Floor 1',
        category: 'BEDROOM',
        x: 100,
        y: 100,
        roomId: roomOnFloor1.id, // ILLEGAL: room is on floor 1, plan is on floor 2!
      });
    } catch (err: any) {
      crossFloorBlocked = true;
      assert(err.message.includes('Cross-floor room assignment is prohibited'), 'Attempting to assign Floor 1 Room to Floor 2 Object threw expected prohibition error');
    }
    assert(crossFloorBlocked, 'Cross-floor room assignment was strictly blocked by backend validation');

    // 3. Invalid Catalog Object Verification
    console.log('\n🛋️ 3. Object Catalog Reference Validation');
    let invalidCatalogBlocked = false;
    try {
      await FloorPlanService.createObject(plan1.id, {
        catalogObjectId: '00000000-0000-0000-0000-000000000000',
        name: 'Fake Catalog Object',
        category: 'GENERAL',
        x: 100,
        y: 100,
      });
    } catch (err: any) {
      invalidCatalogBlocked = true;
      assert(err.message.includes('not found'), 'Attempting to create object with non-existent catalog ID threw error');
    }
    assert(invalidCatalogBlocked, 'Non-existent catalog ID was strictly rejected');

    // 4. Batch Update Ownership Integrity
    console.log('\n📦 4. Cross-Plan Batch Update Tamper Protection');
    const objOnPlan1 = await FloorPlanService.createObject(plan1.id, {
      name: 'Valid Sofa on Floor 1',
      category: 'LIVING_ROOM',
      x: 100,
      y: 100,
    });

    let crossPlanBatchBlocked = false;
    try {
      await FloorPlanService.batchUpdateObjects(plan2.id, [
        { id: objOnPlan1.id, x: 999 }, // ILLEGAL: objOnPlan1 belongs to plan1, not plan2!
      ]);
    } catch (err: any) {
      crossPlanBatchBlocked = true;
      assert(err.message.includes('do not belong to floor plan'), 'Batch update attempting to alter Object on another FloorPlan was rejected');
    }
    assert(crossPlanBatchBlocked, 'Cross-plan batch update tamper protection is active');

    // 5. Cascade Delete & Zero Orphan Records
    console.log('\n🗑️ 5. Cascade Deletion & Orphan Record Prevention');
    const objOnPlan2 = await FloorPlanService.createObject(plan2.id, {
      name: 'Valid Table on Floor 2',
      category: 'GENERAL',
      x: 200,
      y: 200,
    });

    // Delete floor2
    await prisma.floor.delete({ where: { id: floor2.id } });

    // Verify FloorPlan2 was cascade-deleted
    const plan2Check = await prisma.floorPlan.findUnique({ where: { id: plan2.id } });
    assert(plan2Check === null, 'FloorPlan on floor2 was cascade-deleted when floor2 was deleted');

    // Verify Object on FloorPlan2 was cascade-deleted
    const obj2Check = await prisma.floorPlanObject.findUnique({ where: { id: objOnPlan2.id } });
    assert(obj2Check === null, 'FloorPlanObject was cascade-deleted with zero orphan rows');

    // Verify floor1 objects and plans remain completely unaffected
    const plan1Check = await prisma.floorPlan.findUnique({ where: { id: plan1.id } });
    const obj1Check = await prisma.floorPlanObject.findUnique({ where: { id: objOnPlan1.id } });
    assert(plan1Check !== null && obj1Check !== null, 'Floor 1 and its objects remain 100% intact');

    console.log('\n====================================================');
    console.log(`📊 INTEGRITY SUITE: ${passed} passed, ${failed} failed`);
    console.log('====================================================\n');
  } finally {
    // Cleanup temporary test house
    await prisma.house.delete({ where: { id: house.id } }).catch(() => {});
    await prisma.$disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrityAudit().catch((err) => {
  console.error('Integrity audit failed:', err);
  process.exit(1);
});

