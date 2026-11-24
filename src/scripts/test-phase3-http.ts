import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import apiRouter from '../routes/index.js';
import { PrismaClient, RoomType } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', apiRouter);

const PORT = 5098;
let server: Server;

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function fetchJson(url: string, options?: any) {
  const res = await fetch(url, options);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { status: res.status, ok: res.ok, json };
  } catch (e) {
    console.error(`Failed to parse JSON from ${options?.method || 'GET'} ${url} [Status: ${res.status}]:\n${text.substring(0, 300)}`);
    throw e;
  }
}

async function run() {
  server = app.listen(PORT);
  const BASE = `http://localhost:${PORT}/api`;

  console.log('====================================================');
  console.log('🌐 PHASE 3: ROOM SPATIAL HTTP REST API SUITE');
  console.log('====================================================\n');

  try {
    // Setup test house & floor (createHouse automatically provisions level 1 floor)
    const houseRes = await fetchJson(`${BASE}/houses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'HTTP Suite House' }),
    });
    const houseId = houseRes.json.data.id;
    const floorId = houseRes.json.data.floors[0].id;

    const planRes = await fetchJson(`${BASE}/floor-plans/by-floor/${floorId}`);
    const floorPlanId = planRes.json.data.id;

    // 1. Create Room via POST /api/floors/:floorId/rooms
    console.log('🚪 1. Room Creation & Listing');
    const createRes = await fetchJson(`${BASE}/floors/${floorId}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dapur Modern',
        type: 'KITCHEN',
        color: '#10B981',
        polygonCoordinates: [
          { x: 50, y: 50 },
          { x: 250, y: 50 },
          { x: 250, y: 250 },
          { x: 50, y: 250 },
        ],
      }),
    });
    assert(createRes.status === 201, 'POST /api/floors/:floorId/rooms returns 201 Created');
    const created = createRes.json.data;
    assert(created.name === 'Dapur Modern', 'Created room name is correct');
    assert(created.type === 'KITCHEN', 'Created room type is KITCHEN');

    // List rooms
    const listRes = await fetchJson(`${BASE}/floors/${floorId}/rooms`);
    assert(listRes.status === 200, 'GET /api/floors/:floorId/rooms returns 200 OK');
    const listData = listRes.json.data;
    assert(listData.length === 1, 'Returns 1 room for floor');

    // 2. Get room details
    console.log('\n🔍 2. Room Inspection & Details');
    const getRes = await fetchJson(`${BASE}/rooms/${created.id}`);
    assert(getRes.status === 200, 'GET /api/rooms/:id returns 200 OK');
    const roomDetails = getRes.json.data;
    assert(roomDetails.id === created.id, 'Room ID matches');
    assert(roomDetails.floorRel.id === floorId, 'Includes floor relationship');

    // 3. Update room metadata
    console.log('\n✏️ 3. Room Metadata & Color Updates');
    const patchRes = await fetchJson(`${BASE}/rooms/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dapur Bersih', type: 'DINING_ROOM' }),
    });
    assert(patchRes.status === 200, 'PATCH /api/rooms/:id returns 200 OK');
    const patched = patchRes.json.data;
    assert(patched.name === 'Dapur Bersih', 'Updated room name');
    assert(patched.type === 'DINING_ROOM', 'Updated room type');

    const colorRes = await fetchJson(`${BASE}/rooms/${created.id}/color`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#F59E0B' }),
    });
    assert(colorRes.status === 200, 'PATCH /api/rooms/:id/color returns 200 OK');
    const colored = colorRes.json.data;
    assert(colored.color === '#F59E0B', 'Updated room color to amber');

    // 4. Update polygon coordinates
    console.log('\n📐 4. Polygon Modification & Geometry Validation');
    const polyRes = await fetchJson(`${BASE}/rooms/${created.id}/polygon`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygonCoordinates: [
          { x: 50, y: 50 },
          { x: 350, y: 50 },
          { x: 350, y: 350 },
          { x: 50, y: 350 },
        ],
      }),
    });
    assert(polyRes.status === 200, 'PATCH /api/rooms/:id/polygon returns 200 OK');
    const polyData = polyRes.json.data;
    assert(polyData.areaPx === 90000, 'Updated polygon area in px is 90,000');

    // Reject self-intersecting polygon
    const invalidPolyRes = await fetchJson(`${BASE}/rooms/${created.id}/polygon`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        polygonCoordinates: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
          { x: 100, y: 0 },
        ],
      }),
    });
    assert(invalidPolyRes.status === 400, 'PATCH polygon with self-intersection rejected with 400 Bad Request');

    // 5. Create object, test room assignment and spatial detection
    console.log('\n📍 5. Spatial Detection & Object Room Assignment');
    const objRes = await fetchJson(`${BASE}/floor-plans/${floorPlanId}/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Meja Makan',
        category: 'KITCHEN',
        x: 100,
        y: 100,
        width: 80,
        height: 80,
      }),
    });
    const objData = objRes.json.data;

    // Detect spatial assignment
    const detectRes = await fetchJson(`${BASE}/floor-plans/${floorPlanId}/spatial-detect`);
    assert(detectRes.status === 200, 'GET /api/floor-plans/:id/spatial-detect returns 200 OK');
    const detectData = detectRes.json.data;
    const detectedObj = detectData.detections.find((d: any) => d.objectId === objData.id);
    assert(detectedObj.detectedRoomId === created.id, 'Object detected inside Dapur polygon');

    // Assign object to room via PATCH /api/floor-plans/:id/objects/:objectId/room
    const assignRes = await fetchJson(`${BASE}/floor-plans/${floorPlanId}/objects/${objData.id}/room`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: created.id }),
    });
    assert(assignRes.status === 200, 'PATCH /api/floor-plans/:id/objects/:objectId/room returns 200 OK');
    const assignedObj = assignRes.json.data;
    assert(assignedObj.roomId === created.id, 'Object successfully linked to room');

    // 6. Delete Room
    console.log('\n🗑️ 6. Room Deletion & Integrity');
    const delRes = await fetchJson(`${BASE}/rooms/${created.id}`, { method: 'DELETE' });
    assert(delRes.status === 200, 'DELETE /api/rooms/:id returns 200 OK');

    // Verify linked object's roomId was unlinked (null)
    const verifyObjRes = await fetchJson(`${BASE}/floor-plans/${floorPlanId}/objects`);
    const objects = verifyObjRes.json.data;
    const objAfterDel = objects.find((o: any) => o.id === objData.id);
    assert(objAfterDel.roomId === null, 'Deleting room reset object roomId to null');

    // Clean up
    await prisma.house.delete({ where: { id: houseId } });
    console.log('\n✔ HTTP test house cleaned up.');
  } finally {
    server.close();
    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`📊 TOTAL HTTP API TESTS: ${passed} passed, ${failed} failed`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
