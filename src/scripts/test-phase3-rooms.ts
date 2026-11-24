import { PrismaClient, RoomType } from '@prisma/client';
import {
  calculateAreaInSquareMeters,
  calculatePolygonArea,
  hasSelfIntersections,
  isPointInPolygon,
  Point,
  validatePolygonCoordinates,
} from '../utils/geometry.js';
import { RoomService } from '../services/room.service.js';
import { FloorPlanService } from '../services/floor-plan.service.js';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✔ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✖ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('  PHASE 3: ROOM SPATIAL POLYGON & MANAGEMENT TEST SUITE');
  console.log('========================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: GEOMETRY UTILITIES
  // ----------------------------------------------------
  console.log('--- 1. Polygon Geometry & Shoelace Formula ---');

  // 1.1 Triangle: (0,0), (4,0), (0,3) -> Area = 6
  const triangle: Point[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 3 },
  ];
  const triArea = calculatePolygonArea(triangle);
  assert(Math.abs(triArea - 6) < 1e-4, 'Triangle Shoelace area is 6', `Got ${triArea}`);

  // 1.2 Rectangle: 100 x 200 -> Area = 20000
  const rect: Point[] = [
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 200 },
    { x: 100, y: 200 },
  ];
  const rectArea = calculatePolygonArea(rect);
  assert(Math.abs(rectArea - 20000) < 1e-4, 'Rectangle Shoelace area is 20,000', `Got ${rectArea}`);

  // 1.3 L-shaped concave polygon:
  // (0,0) -> (4,0) -> (4,2) -> (2,2) -> (2,4) -> (0,4) -> Area = 4*2 + 2*2 = 12
  const lShape: Point[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ];
  const lArea = calculatePolygonArea(lShape);
  assert(Math.abs(lArea - 12) < 1e-4, 'Concave L-Shape Shoelace area is 12', `Got ${lArea}`);

  // 1.4 Area conversion with calibration (50 px/m)
  // 20,000 px^2 / (50^2) = 20,000 / 2500 = 8 m^2
  const areaM2 = calculateAreaInSquareMeters(rectArea, 50);
  assert(areaM2 === 8, 'Square meters calculation (50 px/m) is 8 m²', `Got ${areaM2}`);

  // 1.5 Area conversion with uncalibrated ratio
  assert(calculateAreaInSquareMeters(rectArea, null) === null, 'Uncalibrated returns null area');
  assert(calculateAreaInSquareMeters(rectArea, 0) === null, 'Zero calibration returns null area');

  console.log('\n--- 2. Polygon Validation & Self-Intersection Detection ---');

  // 2.1 Rejects fewer than 3 vertices
  const vTooFew = validatePolygonCoordinates([
    { x: 10, y: 10 },
    { x: 20, y: 20 },
  ]);
  assert(!vTooFew.valid, 'Rejects polygon with < 3 vertices');

  // 2.2 Rejects non-finite coordinates
  const vNaN = validatePolygonCoordinates([
    { x: 10, y: 10 },
    { x: NaN, y: 20 },
    { x: 30, y: 30 },
  ]);
  assert(!vNaN.valid, 'Rejects polygon with NaN');

  const vInf = validatePolygonCoordinates([
    { x: 10, y: 10 },
    { x: Infinity, y: 20 },
    { x: 30, y: 30 },
  ]);
  assert(!vInf.valid, 'Rejects polygon with Infinity');

  // 2.3 Rejects degenerate / zero-area polygon (collinear points)
  const vCollinear = validatePolygonCoordinates([
    { x: 0, y: 0 },
    { x: 50, y: 50 },
    { x: 100, y: 100 },
  ]);
  assert(!vCollinear.valid, 'Rejects collinear points with zero area');

  // 2.4 Rejects self-intersecting polygon (hourglass/bowtie)
  // (0,0) -> (100,100) -> (0,100) -> (100,0)
  const bowtie: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];
  assert(hasSelfIntersections(bowtie), 'Detects bowtie self-intersection');
  const vBowtie = validatePolygonCoordinates(bowtie);
  assert(!vBowtie.valid, 'Validation rejects self-intersecting bowtie');

  // 2.5 Accepts valid polygons
  const vValid = validatePolygonCoordinates(rect);
  assert(vValid.valid && vValid.sanitized?.length === 4, 'Validates valid rectangle polygon');

  console.log('\n--- 3. Point-in-Polygon (Ray-Casting) Detection ---');

  // Using rect [100,100] to [300,200]
  assert(isPointInPolygon({ x: 200, y: 150 }, rect), 'Point (200, 150) is inside rectangle');
  assert(!isPointInPolygon({ x: 50, y: 50 }, rect), 'Point (50, 50) is outside rectangle');
  assert(!isPointInPolygon({ x: 400, y: 150 }, rect), 'Point (400, 150) is outside rectangle');

  // Concave L-shape: inside the cutout vs inside the body
  // L-Shape bounds: (0,0) to (4,4), cutout at top-right (2,2) to (4,4)
  assert(isPointInPolygon({ x: 1, y: 1 }, lShape), 'Point (1, 1) is inside L-shape');
  assert(isPointInPolygon({ x: 1, y: 3 }, lShape), 'Point (1, 3) is inside L-shape arm');
  assert(!isPointInPolygon({ x: 3, y: 3 }, lShape), 'Point (3, 3) in cutout is outside L-shape');

  // ----------------------------------------------------
  // TEST GROUP 2: DATABASE & SERVICE INTEGRATION
  // ----------------------------------------------------
  console.log('\n--- 4. Room Model & Service Integration ---');

  // Create test house and floor
  const testHouse = await prisma.house.create({
    data: {
      name: 'Phase 3 Test Villa',
      description: 'Temporary house for testing Phase 3 room spatial features',
    },
  });

  const testFloor1 = await prisma.floor.create({
    data: {
      houseId: testHouse.id,
      name: 'Lantai 1 Test',
      levelNumber: 1,
    },
  });

  const testFloor2 = await prisma.floor.create({
    data: {
      houseId: testHouse.id,
      name: 'Lantai 2 Test',
      levelNumber: 2,
    },
  });

  const floorPlan1 = await FloorPlanService.getPlanByFloorId(testFloor1.id);
  // Set scale calibration on floorPlan1: 50 px/m
  await FloorPlanService.saveCalibration(floorPlan1.id, {
    point1: { x: 0, y: 0 },
    point2: { x: 50, y: 0 },
    distanceMeters: 1,
  });

  // 4.1 Create Room with polygon on Floor 1
  const livingRoomPoly: Point[] = [
    { x: 100, y: 100 },
    { x: 500, y: 100 },
    { x: 500, y: 400 },
    { x: 100, y: 400 },
  ]; // Area px = 400 * 300 = 120,000 px^2. Area m2 = 120,000 / 2500 = 48 m^2.

  const createdRoom = await RoomService.createRoom(testFloor1.id, {
    name: 'Ruang Tamu',
    type: RoomType.LIVING_ROOM,
    color: '#6366F1',
    polygonCoordinates: livingRoomPoly,
  });

  assert(createdRoom.id !== undefined, 'Created room has valid ID');
  assert(createdRoom.name === 'Ruang Tamu', 'Room name matches');
  assert(createdRoom.type === RoomType.LIVING_ROOM, 'Room type matches enum LIVING_ROOM');
  assert(createdRoom.color === '#6366F1', 'Room color matches');
  assert(createdRoom.areaSquareMeters === 48, 'Room area is 48 m²', `Got ${createdRoom.areaSquareMeters}`);

  // 4.2 List rooms on floor
  const floor1Rooms = await RoomService.listRoomsByFloor(testFloor1.id);
  assert(floor1Rooms.length === 1, 'listRoomsByFloor returns 1 room');
  assert(floor1Rooms[0].id === createdRoom.id, 'Room ID matches list result');

  // 4.3 Get room by ID
  const fetchedRoom = await RoomService.getRoomById(createdRoom.id);
  assert(fetchedRoom.id === createdRoom.id, 'getRoomById retrieves correct room');
  assert(fetchedRoom.floorRel?.id === testFloor1.id, 'Room includes floor relation');

  // 4.4 Update room metadata
  const updatedMeta = await RoomService.updateRoom(createdRoom.id, {
    name: 'Ruang Tamu Utama',
    type: RoomType.LIVING_ROOM,
    color: '#3B82F6',
  });
  assert(updatedMeta.name === 'Ruang Tamu Utama', 'Updated room name');
  assert(updatedMeta.color === '#3B82F6', 'Updated room color');

  // 4.5 Place objects and test spatial detection
  // Create object inside living room (center at 200, 200)
  const sofa = await FloorPlanService.createObject(floorPlan1.id, {
    name: 'Sofa 3 Seater',
    category: 'LIVING_ROOM',
    x: 160,
    y: 160,
    width: 80,
    height: 80,
  });

  // Create object outside living room (center at 700, 700)
  const outdoorLamp = await FloorPlanService.createObject(floorPlan1.id, {
    name: 'Lampu Teras',
    category: 'GENERAL',
    x: 660,
    y: 660,
    width: 80,
    height: 80,
  });

  // Spatial detection test
  const detectionResult = await RoomService.detectObjectsInRooms(floorPlan1.id);
  assert(detectionResult.detections.length === 2, 'detectObjectsInRooms detected 2 objects');

  const sofaDetection = detectionResult.detections.find((d) => d.objectId === sofa.id);
  assert(
    sofaDetection?.detectedRoomId === createdRoom.id,
    'Sofa correctly detected inside Ruang Tamu polygon'
  );

  const lampDetection = detectionResult.detections.find((d) => d.objectId === outdoorLamp.id);
  assert(
    lampDetection?.detectedRoomId === null,
    'Outdoor lamp correctly detected outside any room polygon'
  );

  // 4.6 Assign object to room
  const assignedSofa = await RoomService.assignObjectToRoom(floorPlan1.id, sofa.id, createdRoom.id);
  assert(assignedSofa.roomId === createdRoom.id, 'Assigned sofa to Ruang Tamu');

  // 4.7 Cross-floor assignment prevention
  // Create room on Floor 2
  const bedroom2 = await RoomService.createRoom(testFloor2.id, {
    name: 'Kamar Lantai 2',
    type: RoomType.BEDROOM,
  });

  let crossFloorBlocked = false;
  try {
    // Attempt to assign sofa (on Floor 1) to bedroom2 (on Floor 2)
    await RoomService.assignObjectToRoom(floorPlan1.id, sofa.id, bedroom2.id);
  } catch (err: any) {
    crossFloorBlocked = true;
    assert(
      err.message.includes('Cross-floor room assignment is prohibited'),
      'Cross-floor error message is explicit'
    );
  }
  assert(crossFloorBlocked, 'Cross-floor object assignment strictly blocked');

  // 4.8 Update room polygon & orphan detection
  // Shrink polygon so sofa (at 160,160) is now OUTSIDE: new bounds [300, 300] to [500, 500]
  const shrunkPoly: Point[] = [
    { x: 300, y: 300 },
    { x: 500, y: 300 },
    { x: 500, y: 500 },
    { x: 300, y: 500 },
  ]; // Area px = 200 * 200 = 40,000 px^2 -> 16 m^2

  const polyUpdateResult = await RoomService.updateRoomPolygon(createdRoom.id, shrunkPoly);
  assert(polyUpdateResult.areaSquareMeters === 16, 'Recalculated area after shrink is 16 m²');
  assert(polyUpdateResult.hasOrphanedObjects === true, 'Detected orphaned object after polygon shrink');
  assert(
    polyUpdateResult.orphanedObjects.some((o) => o.id === sofa.id),
    'Sofa is in orphanedObjects list'
  );

  // 4.9 Delete room
  await RoomService.deleteRoom(createdRoom.id);
  const recheckedSofa = await prisma.floorPlanObject.findUnique({ where: { id: sofa.id } });
  assert(recheckedSofa?.roomId === null, 'Deleting room reset sofa.roomId to null (no orphan FK error)');

  // 4.10 Cleanup test house
  await prisma.house.delete({ where: { id: testHouse.id } });
  console.log('\n✔ Test cleanup completed.');

  console.log('\n========================================================');
  console.log(`  PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((e) => {
    console.error('Fatal test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

