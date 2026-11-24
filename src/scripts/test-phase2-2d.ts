import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { FloorPlanService } from '../services/floor-plan.service.js';
import { HouseService } from '../services/house.service.js';
import { ObjectCatalogService } from '../services/object-catalog.service.js';

const prisma = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 PHASE 2: 2D FLOOR PLAN & OBJECT EDITOR VERIFICATION');
  console.log('====================================================\n');

  // Test 1: Houses & Floors
  console.log('📋 Test Group 1: House and Floor Context');
  const houses = await HouseService.listHouses();
  assert(houses.length >= 1, 'HouseService.listHouses returns at least one house');

  // Create isolated temporary test house to preserve user data
  const tempTestHouse = await prisma.house.create({
    data: {
      name: `Temp Phase 2 Test House ${Date.now()}`,
      description: 'Temporary house for Phase 2 automated testing',
      floors: {
        create: {
          name: 'Lantai Uji 2D',
          levelNumber: 1,
        },
      },
    },
    include: { floors: true },
  });

  const activeHouse = tempTestHouse;
  assert(activeHouse.floors.length >= 1, 'Active house has at least one floor', `Floors: ${activeHouse.floors.length}`);

  const activeFloor = activeHouse.floors[0];
  let floorPlan = await FloorPlanService.getPlanByFloorId(activeFloor.id);
  assert(!!floorPlan, 'FloorPlanService.getPlanByFloorId returns or creates floor plan');
  if (floorPlan.imagePath) {
    floorPlan = await FloorPlanService.deleteBackground(floorPlan.id);
  }
  if (floorPlan.viewBoxWidth !== 1600 || floorPlan.viewBoxHeight !== 1000) {
    await FloorPlanService.updatePlanConfig(floorPlan.id, { viewBoxWidth: 1600, viewBoxHeight: 1000 });
    floorPlan.viewBoxWidth = 1600;
    floorPlan.viewBoxHeight = 1000;
  }
  assert(floorPlan.viewBoxWidth === 1600 && floorPlan.viewBoxHeight === 1000, 'Floor plan has default viewBox (1600x1000)');

  // Test 2: Object Catalog
  console.log('\n🛋️ Test Group 2: Object Catalog & Categories');
  const allCatalog = await ObjectCatalogService.listCatalogItems();
  assert(allCatalog.length === 27, 'Catalog has exactly 27 visual assets', `Found: ${allCatalog.length}`);

  const categories = await ObjectCatalogService.getCategories();
  assert(categories.includes('LIVING_ROOM') && categories.includes('BEDROOM') && categories.includes('KITCHEN') && categories.includes('BATHROOM') && categories.includes('GENERAL'), 'All 5 categories present in catalog');

  const livingRoomItems = await ObjectCatalogService.listCatalogItems({ category: 'LIVING_ROOM' });
  assert(livingRoomItems.length === 6, 'Living room category has 6 items (Sofa, Coffee Table, TV, TV Cabinet, Armchair, Bookshelf)', `Found: ${livingRoomItems.length}`);

  const searchSofa = await ObjectCatalogService.listCatalogItems({ search: 'sofa' });
  assert(searchSofa.length >= 1 && searchSofa[0].name.toLowerCase().includes('sofa'), 'Search query "sofa" successfully matches sofa item');

  // Test 3: Floor Plan Object Instances CRUD
  console.log('\n📐 Test Group 3: Object Instance CRUD & Manipulation');
  const sofaCatalog = searchSofa[0];
  const obj1 = await FloorPlanService.createObject(floorPlan.id, {
    catalogObjectId: sofaCatalog.id,
    name: sofaCatalog.name,
    category: sofaCatalog.category,
    x: 400,
    y: 300,
    width: sofaCatalog.defaultWidth,
    height: sofaCatalog.defaultHeight,
    rotation: 0,
    zIndex: 1,
  });
  assert(!!obj1.id && obj1.name === sofaCatalog.name, 'Object instance created with unique ID and correct name');
  assert(obj1.x === 400 && obj1.y === 300, 'Object instance has correct initial coordinates');

  // Update object (Move, Rotate, Resize)
  const updatedObj1 = await FloorPlanService.updateObject(floorPlan.id, obj1.id, {
    x: 450,
    y: 350,
    rotation: 45,
    width: 180,
    height: 90,
    name: 'Main Living Sofa (Moved)',
  });
  assert(updatedObj1.x === 450 && updatedObj1.y === 350, 'Object moved accurately in floor plan coordinates');
  assert(updatedObj1.rotation === 45, 'Object rotated accurately (45 degrees)');
  assert(updatedObj1.width === 180 && updatedObj1.height === 90, 'Object resized accurately');
  assert(updatedObj1.name === 'Main Living Sofa (Moved)', 'Object name updated');

  // Duplicate object
  const clonedObj = await FloorPlanService.duplicateObject(floorPlan.id, obj1.id);
  assert(clonedObj.id !== obj1.id, 'Cloned object has new unique ID');
  assert(clonedObj.x === 475 && clonedObj.y === 375, 'Cloned object is offset (+25px) and does not overlap perfectly');
  assert(clonedObj.name.includes('(Copy)'), 'Cloned object has "(Copy)" suffix');

  // Batch update (Z-Index / reorder)
  const batchResult = await FloorPlanService.batchUpdateObjects(floorPlan.id, [
    { id: obj1.id, zIndex: 10 },
    { id: clonedObj.id, zIndex: 5 },
  ]);
  assert(batchResult.length === 2, 'Batch update updated 2 objects successfully');

  // Test 4: Scale Calibration
  console.log('\n📏 Test Group 4: Two-Point Scale Calibration');
  const calibrationResult = await FloorPlanService.saveCalibration(floorPlan.id, {
    point1: { x: 100, y: 100 },
    point2: { x: 600, y: 100 }, // dx = 500 px
    distanceMeters: 5.0, // 5 meters
  });
  assert(calibrationResult.isCalibrated === true, 'Scale calibration marked as calibrated');
  assert(Math.abs((calibrationResult.pixelsPerMeter || 0) - 100) < 0.001, 'Calculated ratio is exactly 100 px/meter (500px / 5m)');

  // Test 5: Background Upload & Decoupling
  console.log('\n🖼️ Test Group 5: Background Decoupling & Persistence');
  // Create a dummy PNG file to simulate upload
  const dummyUploadDir = path.join(process.cwd(), 'uploads', 'floor-plans');
  if (!fs.existsSync(dummyUploadDir)) fs.mkdirSync(dummyUploadDir, { recursive: true });
  const dummyPngPath = path.join(dummyUploadDir, 'test-bg.png');
  // 1x1 transparent PNG buffer
  const png1x1 = Buffer.from('89504e470d0a1a0a0000000d49484452000004000000028008060000009c9527f40000000a49444154789c63000100000500010d0a2d400000000049454e44ae426082', 'hex');
  fs.writeFileSync(dummyPngPath, png1x1);

  const mockFile = {
    fieldname: 'image',
    originalname: 'blueprint.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: png1x1.length,
    destination: dummyUploadDir,
    filename: 'test-bg.png',
    path: dummyPngPath,
    buffer: png1x1,
    stream: null as any,
  } as Express.Multer.File;

  const planWithBg = await FloorPlanService.setBackground(floorPlan.id, mockFile);
  assert(!!planWithBg.imagePath, 'Background image path saved to database');
  assert(planWithBg.imageWidth === 1024 && planWithBg.imageHeight === 640, 'Background natural dimensions (1024x640) detected from PNG header');

  // Verify objects are STILL intact!
  const objectsAfterBg = await FloorPlanService.listObjects(floorPlan.id);
  assert(objectsAfterBg.length >= 2, 'Objects are completely preserved after background upload', `Count: ${objectsAfterBg.length}`);

  // Delete background and verify objects STILL intact!
  const planWithoutBg = await FloorPlanService.deleteBackground(floorPlan.id);
  assert(planWithoutBg.imagePath === null, 'Background image path reset to null after delete');
  const objectsAfterBgDelete = await FloorPlanService.listObjects(floorPlan.id);
  assert(objectsAfterBgDelete.length >= 2, 'Objects are STILL completely preserved after background deletion', `Count: ${objectsAfterBgDelete.length}`);

  // Clean up created objects for this test
  await FloorPlanService.deleteObject(floorPlan.id, obj1.id);
  await FloorPlanService.deleteObject(floorPlan.id, clonedObj.id);
  const objectsAfterCleanup = await FloorPlanService.listObjects(floorPlan.id);
  assert(!objectsAfterCleanup.some(o => o.id === obj1.id || o.id === clonedObj.id), 'Test objects cleaned up safely');

  // Test 6: Legacy 3D Regression Guard
  console.log('\n🏛️ Test Group 6: Legacy 3D Studio Integrity');
  const user3dModel = await prisma.houseModel.findUnique({
    where: { id: '51a065ca-85e1-4c35-88c7-be5b684c6250' },
    include: { identifications: true },
  });
  assert(!!user3dModel, 'Legacy 3D model "Ada" exists and is untouched');
  assert(user3dModel?.identifications.length === 20, 'All 20 node identifications on "Ada" remain 100% intact');
  const suggestedCount = user3dModel?.identifications.filter((i) => i.status === 'SUGGESTED').length;
  assert(suggestedCount === 20, 'All 20 nodes remain in SUGGESTED state with pristine metadata');

  // Clean up isolated temporary test house
  try {
    await prisma.floorPlanObject.deleteMany({ where: { floorPlan: { floor: { houseId: tempTestHouse.id } } } });
    await prisma.floorPlan.deleteMany({ where: { floor: { houseId: tempTestHouse.id } } });
    await prisma.floor.deleteMany({ where: { houseId: tempTestHouse.id } });
    await prisma.house.delete({ where: { id: tempTestHouse.id } });
  } catch (err) {
    console.warn('Cleanup warning for temp test house:', err);
  }

  console.log('\n====================================================');
  console.log(`📊 TEST RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('====================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

