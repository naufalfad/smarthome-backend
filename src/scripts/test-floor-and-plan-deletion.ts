import { PrismaClient } from '@prisma/client';
import { HouseService } from '../services/house.service.js';
import { FloorPlanService } from '../services/floor-plan.service.js';
import { resolveUploadPath, FLOOR_PLANS_DIR } from '../utils/storage-path.util.js';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function run() {
  console.log('====================================================');
  console.log('🧪 TEST: FLOOR PLAN BACKGROUND & FLOOR DELETION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  let testHouse: any = null;

  try {
    // 1. Create a dedicated test house with 2 floors
    console.log('--- 1. Setup Test House & Floors ---');
    testHouse = await prisma.house.create({
      data: {
        name: `Test Deletion Villa ${Date.now()}`,
        description: 'Temporary house for testing floor and background deletion',
        floors: {
          create: [
            {
              name: 'Lantai 1 Test',
              levelNumber: 1,
              floorPlan: {
                create: {
                  name: 'Lantai 1 Plan',
                  viewBoxWidth: 1600,
                  viewBoxHeight: 1000,
                },
              },
            },
            {
              name: 'Lantai 2 Test',
              levelNumber: 2,
              floorPlan: {
                create: {
                  name: 'Lantai 2 Plan',
                  viewBoxWidth: 1600,
                  viewBoxHeight: 1000,
                },
              },
            },
          ],
        },
      },
      include: {
        floors: {
          include: { floorPlan: true },
        },
      },
    });

    assert(testHouse.floors.length === 2, 'Test house created with 2 floors');

    // 2. Test Floor Plan Background Deletion
    console.log('\n--- 2. Background Deletion Test ---');
    const floor1 = testHouse.floors[0];
    const floorPlan1 = floor1.floorPlan;

    // Simulate dummy background image on disk
    const dummyFilename = `test-dummy-bg-${Date.now()}.png`;
    const dummyPath = path.join(FLOOR_PLANS_DIR, dummyFilename);
    fs.writeFileSync(dummyPath, Buffer.from([1, 2, 3, 4]));
    const relPath = `uploads/floor-plans/${dummyFilename}`;

    await prisma.floorPlan.update({
      where: { id: floorPlan1.id },
      data: {
        imagePath: relPath,
        imageWidth: 1600,
        imageHeight: 1000,
        imageSize: 4,
      },
    });

    assert(fs.existsSync(dummyPath), 'Dummy background file created on disk');

    // Delete background
    const clearedPlan = await FloorPlanService.deleteBackground(floorPlan1.id);
    assert(clearedPlan.imagePath === null, 'Floor plan imagePath reset to null');
    assert(clearedPlan.imageWidth === null, 'Floor plan imageWidth reset to null');
    assert(clearedPlan.imageHeight === null, 'Floor plan imageHeight reset to null');
    assert(!fs.existsSync(dummyPath), 'Physical background file deleted from disk');

    // 3. Test Floor Deletion
    console.log('\n--- 3. Floor Deletion Test ---');
    const floor2 = testHouse.floors[1];

    // Put a dummy background on floor 2 to test disk cleanup when floor is deleted
    const dummyFilename2 = `test-dummy-floor2-${Date.now()}.png`;
    const dummyPath2 = path.join(FLOOR_PLANS_DIR, dummyFilename2);
    fs.writeFileSync(dummyPath2, Buffer.from([5, 6, 7, 8]));
    await prisma.floorPlan.update({
      where: { id: floor2.floorPlan.id },
      data: { imagePath: `uploads/floor-plans/${dummyFilename2}` },
    });
    assert(fs.existsSync(dummyPath2), 'Floor 2 dummy background created on disk');

    // Delete floor 2
    const updatedHouseAfterDel = await HouseService.deleteFloor(testHouse.id, floor2.id);
    assert(updatedHouseAfterDel !== null, 'Updated house returned after floor deletion');
    assert(updatedHouseAfterDel!.floors.length === 1, 'House now has exactly 1 floor remaining');
    assert(updatedHouseAfterDel!.floors[0].id === floor1.id, 'Remaining floor is Floor 1');
    assert(!fs.existsSync(dummyPath2), 'Floor 2 background file removed from disk on floor deletion');

    const checkFloor2InDb = await prisma.floor.findUnique({ where: { id: floor2.id } });
    assert(checkFloor2InDb === null, 'Floor 2 record completely removed from database');

    const checkFloorPlan2InDb = await prisma.floorPlan.findUnique({ where: { id: floor2.floorPlan.id } });
    assert(checkFloorPlan2InDb === null, 'Floor 2 floor plan record cascaded and removed from database');

    // 4. Test Guard: Cannot delete the last remaining floor
    console.log('\n--- 4. Minimum 1 Floor Guard Test ---');
    let guardBlocked = false;
    try {
      await HouseService.deleteFloor(testHouse.id, floor1.id);
    } catch (err: any) {
      guardBlocked = true;
      assert(err.message.includes('minimal harus memiliki 1 lantai'), `Guarded error received: "${err.message}"`);
    }
    assert(guardBlocked, 'Attempting to delete the only remaining floor is strictly blocked');

    // 5. Test Adding and Deleting Floor Cycle
    console.log('\n--- 5. Add Floor & Delete Cycle ---');
    const newFloor = await HouseService.addFloor(testHouse.id, { name: 'Lantai 3 Tambahan' });
    assert(newFloor.name === 'Lantai 3 Tambahan', 'Added new floor successfully');
    assert(newFloor.floorPlan !== null, 'New floor has interactive floor plan auto-created');

    const houseWith3 = await HouseService.getHouseById(testHouse.id);
    assert(houseWith3!.floors.length === 2, 'House now has 2 floors again');

    const houseAfterDelNew = await HouseService.deleteFloor(testHouse.id, newFloor.id);
    assert(houseAfterDelNew!.floors.length === 1, 'New floor deleted cleanly, back to 1 floor');

  } catch (err) {
    console.error('Fatal error during test:', err);
    failed++;
  } finally {
    // Cleanup test house
    if (testHouse) {
      try {
        await prisma.house.delete({ where: { id: testHouse.id } });
        console.log('\n🧹 Cleanup: Test house removed cleanly.');
      } catch (err) {
        console.warn('Failed to clean up test house:', err);
      }
    }
    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();

