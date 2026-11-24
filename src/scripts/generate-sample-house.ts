import fs from 'fs';
import path from 'path';

/**
 * Creates a valid binary GLB 2.0 file representing a 3D Dollhouse
 * with rooms, walls, furniture/lights meshes, and Empty Object anchors.
 */
export function buildDollhouseGlb(): Buffer {
  // We will build a single shared buffer containing vertex positions and normals for a cube (1x1x1)
  // 8 vertices for a unit cube:
  // v0: [-0.5, -0.5,  0.5]
  // v1: [ 0.5, -0.5,  0.5]
  // v2: [ 0.5,  0.5,  0.5]
  // v3: [-0.5,  0.5,  0.5]
  // v4: [-0.5, -0.5, -0.5]
  // v5: [ 0.5, -0.5, -0.5]
  // v6: [ 0.5,  0.5, -0.5]
  // v7: [-0.5,  0.5, -0.5]
  // 36 indices (12 triangles)

  const positions = new Float32Array([
    // Front face
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
    // Back face
    -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
    // Top face
    -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,
    // Bottom face
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // Right face
     0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
    // Left face
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  ]);

  const normals = new Float32Array([
    // Front
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Top
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0,  1,  2,      0,  2,  3,    // front
    4,  5,  6,      4,  6,  7,    // back
    8,  9,  10,     8,  10, 11,   // top
    12, 13, 14,     12, 14, 15,   // bottom
    16, 17, 18,     16, 18, 19,   // right
    20, 21, 22,     20, 22, 23    // left
  ]);

  // Buffer layout:
  // [positions (24 * 3 * 4 = 288 bytes)]
  // [normals   (24 * 3 * 4 = 288 bytes)]
  // [indices   (36 * 2 = 72 bytes)] -> pad to 4 bytes: 72 is divisible by 4!
  // Total binary size = 288 + 288 + 72 = 648 bytes

  const posBytes = Buffer.from(positions.buffer);
  const normBytes = Buffer.from(normals.buffer);
  const indBytes = Buffer.from(indices.buffer);

  const binBuffer = Buffer.concat([posBytes, normBytes, indBytes]);

  const materials = [
    { name: 'Mat_Walls', pbrMetallicRoughness: { baseColorFactor: [0.75, 0.70, 0.95, 0.85], roughnessFactor: 0.3 } },
    { name: 'Mat_Floor', pbrMetallicRoughness: { baseColorFactor: [0.92, 0.92, 0.96, 1.0], roughnessFactor: 0.6 } },
    { name: 'Mat_Light', pbrMetallicRoughness: { baseColorFactor: [1.0, 0.9, 0.4, 1.0], roughnessFactor: 0.1 } },
    { name: 'Mat_Device', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.8, 0.6, 1.0], roughnessFactor: 0.2 } },
  ];

  const meshes = [
    // Mesh 0: Wall
    { name: 'WALL_MESH', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] },
    // Mesh 1: Floor
    { name: 'FLOOR_MESH', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 1 }] },
    // Mesh 2: Light fixture
    { name: 'OBJ_LIGHT_MESH', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 2 }] },
    // Mesh 3: AC unit
    { name: 'OBJ_AC_MESH', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 3 }] },
  ];

  // Define Nodes matching Dollhouse structure:
  // Node 0: HOUSE_01 (root) -> children: [1 (FLOOR_01), 2 (FLOOR_02)]
  // Node 1: FLOOR_01 -> children: [3 (ROOM_LIVING), 4 (ROOM_BEDROOM)]
  // Node 2: FLOOR_02 -> children: [5 (ROOM_KITCHEN), 6 (ROOM_BATHROOM)]
  //
  // Inside ROOM_LIVING (3):
  //  -> children: [7 (WALL_LIVING), 8 (FLOOR_LIVING), 9 (OBJ_LIGHT_LIVING_01), 10 (OBJ_AC_LIVING_01), 11 (ANCHOR_TEMP_LIVING_01)]
  //
  // Inside ROOM_BEDROOM (4):
  //  -> children: [12 (WALL_BEDROOM), 13 (FLOOR_BEDROOM), 14 (OBJ_LIGHT_BEDROOM_01), 15 (ANCHOR_TEMP_BEDROOM_01)]
  //
  // Inside ROOM_KITCHEN (5):
  //  -> children: [16 (WALL_KITCHEN), 17 (FLOOR_KITCHEN), 18 (OBJ_SMOKE_KITCHEN_01)]
  //
  // Inside ROOM_BATHROOM (6):
  //  -> children: [19 (WALL_BATHROOM), 20 (FLOOR_BATHROOM)]

  const nodes = [
    // 0: Root House
    { name: 'HOUSE_01', children: [1, 2] },
    // 1: Floor 1
    { name: 'FLOOR_01', children: [3, 4], translation: [0, 0, 0] },
    // 2: Floor 2
    { name: 'FLOOR_02', children: [5, 6], translation: [0, 3.2, 0] },

    // 3: ROOM_LIVING
    { name: 'ROOM_LIVING', children: [7, 8, 9, 10, 11], translation: [-2.5, 0, 0] },
    // 4: ROOM_BEDROOM
    { name: 'ROOM_BEDROOM', children: [12, 13, 14, 15], translation: [2.5, 0, 0] },
    // 5: ROOM_KITCHEN
    { name: 'ROOM_KITCHEN', children: [16, 17, 18], translation: [-2.5, 0, 0] },
    // 6: ROOM_BATHROOM
    { name: 'ROOM_BATHROOM', children: [19, 20], translation: [2.5, 0, 0] },

    // Living Room items:
    // 7: WALL_LIVING
    { name: 'WALL_LIVING', mesh: 0, translation: [0, 1.4, 0], scale: [4.8, 2.6, 4.8] },
    // 8: FLOOR_LIVING
    { name: 'FLOOR_LIVING', mesh: 1, translation: [0, 0.05, 0], scale: [4.7, 0.1, 4.7] },
    // 9: OBJ_LIGHT_LIVING_01
    { name: 'OBJ_LIGHT_LIVING_01', mesh: 2, translation: [0, 2.5, 0], scale: [0.6, 0.3, 0.6] },
    // 10: OBJ_AC_LIVING_01
    { name: 'OBJ_AC_LIVING_01', mesh: 3, translation: [2.1, 2.2, 0], scale: [0.3, 0.4, 1.0] },
    // 11: ANCHOR_TEMP_LIVING_01 (Empty Object / No mesh!)
    { name: 'ANCHOR_TEMP_LIVING_01', translation: [1.5, 1.2, -1.8] },

    // Bedroom items:
    // 12: WALL_BEDROOM
    { name: 'WALL_BEDROOM', mesh: 0, translation: [0, 1.4, 0], scale: [4.8, 2.6, 4.8] },
    // 13: FLOOR_BEDROOM
    { name: 'FLOOR_BEDROOM', mesh: 1, translation: [0, 0.05, 0], scale: [4.7, 0.1, 4.7] },
    // 14: OBJ_LIGHT_BEDROOM_01
    { name: 'OBJ_LIGHT_BEDROOM_01', mesh: 2, translation: [0, 2.5, 0], scale: [0.5, 0.25, 0.5] },
    // 15: ANCHOR_TEMP_BEDROOM_01 (Empty Object / No mesh!)
    { name: 'ANCHOR_TEMP_BEDROOM_01', translation: [-1.2, 1.1, 1.5] },

    // Kitchen items:
    // 16: WALL_KITCHEN
    { name: 'WALL_KITCHEN', mesh: 0, translation: [0, 1.4, 0], scale: [4.8, 2.6, 4.8] },
    // 17: FLOOR_KITCHEN
    { name: 'FLOOR_KITCHEN', mesh: 1, translation: [0, 0.05, 0], scale: [4.7, 0.1, 4.7] },
    // 18: OBJ_SMOKE_KITCHEN_01
    { name: 'OBJ_SMOKE_KITCHEN_01', mesh: 3, translation: [0, 2.6, 0], scale: [0.4, 0.15, 0.4] },

    // Bathroom items:
    // 19: WALL_BATHROOM
    { name: 'WALL_BATHROOM', mesh: 0, translation: [0, 1.4, 0], scale: [4.8, 2.6, 4.8] },
    // 20: FLOOR_BATHROOM
    { name: 'FLOOR_BATHROOM', mesh: 1, translation: [0, 0.05, 0], scale: [4.7, 0.1, 4.7] },
  ];

  const gltfManifest = {
    asset: { version: '2.0', generator: 'SmartHome3D Dollhouse Generator' },
    scene: 0,
    scenes: [{ name: 'DollhouseScene', nodes: [0] }],
    nodes,
    meshes,
    materials,
    buffers: [{ byteLength: binBuffer.length }],
    bufferViews: [
      // View 0: positions
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      // View 1: normals
      { buffer: 0, byteOffset: posBytes.length, byteLength: normBytes.length, target: 34962 },
      // View 2: indices
      { buffer: 0, byteOffset: posBytes.length + normBytes.length, byteLength: indBytes.length, target: 34963 },
    ],
    accessors: [
      // 0: POSITION
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      // 1: NORMAL
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
      },
      // 2: INDICES
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
      },
    ],
  };

  const jsonStr = JSON.stringify(gltfManifest);
  // glTF 2.0 requires JSON chunk data to be padded with trailing spaces (0x20) to a multiple of 4 bytes
  let jsonBuffer = Buffer.from(jsonStr, 'utf-8');
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  if (jsonPadding > 0) {
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(jsonPadding, 0x20)]);
  }

  // BIN chunk data must also be padded with zeros (0x00) to a multiple of 4 bytes
  let binPadded = binBuffer;
  const binPadding = (4 - (binBuffer.length % 4)) % 4;
  if (binPadding > 0) {
    binPadded = Buffer.concat([binPadded, Buffer.alloc(binPadding, 0x00)]);
  }

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binPadded.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);          // version 2
  header.writeUInt32LE(totalLength, 8); // total file length

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binChunkHeader, binPadded]);
}

async function main() {
  const glbBuffer = buildDollhouseGlb();
  const outDir = path.join(process.cwd(), 'scratch');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'sample_modern_dollhouse.glb');
  await fs.promises.writeFile(outPath, glbBuffer);
  console.log(`✅ Sample 3D Dollhouse GLB created successfully at: ${outPath} (${glbBuffer.length} bytes)`);
}

if (process.argv[1]?.includes('generate-sample-house')) {
  main().catch(console.error);
}

