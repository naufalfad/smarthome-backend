import fs from 'fs';
import { validateGlbBuffer } from '../utils/glb-validator.js';

export type NodeClassificationType =
  | 'ROOM'
  | 'FLOOR'
  | 'OBJ'
  | 'ANCHOR'
  | 'WALL'
  | 'WINDOW'
  | 'DOOR'
  | 'OTHER';

export interface NodeTransform {
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion [x, y, z, w]
  scale: [number, number, number];
}

export interface NodeInfo {
  index: number;
  name: string;
  type: 'Empty' | 'Mesh' | 'Group' | 'Camera' | 'Light';
  classification: NodeClassificationType;
  hasMesh: boolean;
  isEmpty: boolean; // Empty object from Blender without geometry
  isAnchor: boolean;
  meshIndex?: number;
  parentIndex: number | null;
  parentName: string | null;
  childrenIndices: number[];
  childrenNames: string[];
  transform: NodeTransform;
  children?: NodeInfo[];
}

export interface MeshInfo {
  index: number;
  name: string;
  primitivesCount: number;
  materialIndices: number[];
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface MaterialInfo {
  index: number;
  name: string;
}

export interface BoundingBox3D {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
  center: [number, number, number];
}

export interface SceneInfo {
  sceneCount: number;
  defaultSceneIndex: number;
  sceneName: string;
  rootNodeIndices: number[];
  rootNodeNames: string[];
}

export interface GlbInspectionSummary {
  totalNodes: number;
  totalMeshes: number;
  totalMaterials: number;
  totalScenes: number;
  totalEmptyAnchors: number;
  totalRoomsDetected: number;
  totalFloorsDetected: number;
  totalDevicesDetected: number;
}

export interface GlbInspectionResult {
  summary: GlbInspectionSummary;
  scene: SceneInfo;
  boundingBox: BoundingBox3D;
  dimensions: {
    x: number;
    y: number;
    z: number;
    unitHint: string;
  };
  nodeTree: NodeInfo[];
  allNodesFlat: NodeInfo[];
  classifiedNodes: {
    rooms: string[];
    floors: string[];
    objects: string[];
    anchors: string[];
    walls: string[];
    windows: string[];
    doors: string[];
    other: string[];
  };
  meshes: MeshInfo[];
  materials: MaterialInfo[];
  inspectedAt: string;
}

/**
 * Classifies node by naming conventions (e.g. ROOM_*, FLOOR_*, OBJ_*, ANCHOR_*, WALL_*)
 */
export const classifyNodeByName = (name: string): NodeClassificationType => {
  const upper = (name || '').trim().toUpperCase();

  // Prefix checks take highest priority
  if (/^ANCHOR[_-]|(?:^|_)SENSOR(?:_|$)|(?:^|_)TEMP(?:_|$)|(?:^|_)BEACON(?:_|$)/i.test(upper)) return 'ANCHOR';
  if (/^OBJ[_-]|(?:^|_)LIGHT(?:_|$)|(?:^|_)LAMP(?:_|$)|(?:^|_)AC[_-]|(?:^|_)HEATER(?:_|$)|(?:^|_)CAMERA(?:_|$)|(?:^|_)SWITCH(?:_|$)|(?:^|_)SMOKE(?:_|$)/i.test(upper)) return 'OBJ';
  if (/^WALL[_-]/i.test(upper)) return 'WALL';
  if (/^WINDOW[_-]/i.test(upper)) return 'WINDOW';
  if (/^DOOR[_-]/i.test(upper)) return 'DOOR';
  if (/^FLOOR[_-]/i.test(upper)) return 'FLOOR';
  if (/^ROOM[_-]|(?:^|_)LIVING(?:_|$)|(?:^|_)BEDROOM(?:_|$)|(?:^|_)KITCHEN(?:_|$)|(?:^|_)BATHROOM(?:_|$)|(?:^|_)DINING(?:_|$)|(?:^|_)BALCONY(?:_|$)|(?:^|_)GARAGE(?:_|$)/i.test(upper)) return 'ROOM';

  return 'OTHER';
};

/**
 * Parses the glTF JSON chunk from a binary GLB buffer
 */
export const extractGltfJsonFromGlb = (buffer: Buffer): any => {
  const validation = validateGlbBuffer(buffer);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid GLB buffer');
  }

  // GLB Header is 12 bytes. First chunk starts at byte 12.
  if (buffer.length < 20) {
    throw new Error('GLB file has truncated chunk header');
  }

  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);

  // 0x4E4F534A is ASCII "JSON" in little-endian
  if (chunkType !== 0x4e4f534a) {
    const chunkTypeStr = buffer.subarray(16, 20).toString('ascii');
    throw new Error(`First GLB chunk must be JSON (0x4E4F534A), received '${chunkTypeStr}'`);
  }

  const jsonStart = 20;
  const jsonEnd = jsonStart + chunkLength;

  if (jsonEnd > buffer.length) {
    throw new Error(`GLB JSON chunk claims length ${chunkLength}, but buffer only has ${buffer.length - jsonStart} bytes`);
  }

  const jsonString = buffer.subarray(jsonStart, jsonEnd).toString('utf-8');
  try {
    return JSON.parse(jsonString);
  } catch (err: any) {
    throw new Error(`Failed to parse glTF JSON manifest: ${err?.message}`);
  }
};

/**
 * Comprehensive GLB Inspection Engine
 */
export const inspectGlbBuffer = (buffer: Buffer): GlbInspectionResult => {
  const gltf = extractGltfJsonFromGlb(buffer);

  const rawScenes: any[] = gltf.scenes || [];
  const rawNodes: any[] = gltf.nodes || [];
  const rawMeshes: any[] = gltf.meshes || [];
  const rawMaterials: any[] = gltf.materials || [];
  const rawAccessors: any[] = gltf.accessors || [];

  const defaultSceneIndex = typeof gltf.scene === 'number' ? gltf.scene : 0;
  const defaultScene = rawScenes[defaultSceneIndex] || { nodes: [] };
  const rootNodeIndices: number[] = defaultScene.nodes || [];

  // Map parent indices
  const parentMap = new Map<number, number>();
  rawNodes.forEach((node, nodeIdx) => {
    if (Array.isArray(node.children)) {
      node.children.forEach((childIdx: number) => {
        parentMap.set(childIdx, nodeIdx);
      });
    }
  });

  // Calculate bounding box from accessors min/max
  let globalMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let globalMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let hasValidBounds = false;

  const meshBoundsMap = new Map<number, { min: [number, number, number]; max: [number, number, number] }>();

  rawMeshes.forEach((mesh, meshIdx) => {
    let meshMin: [number, number, number] = [Infinity, Infinity, Infinity];
    let meshMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    let meshHasBounds = false;

    if (Array.isArray(mesh.primitives)) {
      mesh.primitives.forEach((prim: any) => {
        const posAccessorIdx = prim.attributes?.POSITION;
        if (typeof posAccessorIdx === 'number' && rawAccessors[posAccessorIdx]) {
          const acc = rawAccessors[posAccessorIdx];
          if (Array.isArray(acc.min) && Array.isArray(acc.max)) {
            meshHasBounds = true;
            hasValidBounds = true;
            meshMin[0] = Math.min(meshMin[0], acc.min[0]);
            meshMin[1] = Math.min(meshMin[1], acc.min[1]);
            meshMin[2] = Math.min(meshMin[2], acc.min[2]);

            meshMax[0] = Math.max(meshMax[0], acc.max[0]);
            meshMax[1] = Math.max(meshMax[1], acc.max[1]);
            meshMax[2] = Math.max(meshMax[2], acc.max[2]);

            globalMin[0] = Math.min(globalMin[0], acc.min[0]);
            globalMin[1] = Math.min(globalMin[1], acc.min[1]);
            globalMin[2] = Math.min(globalMin[2], acc.min[2]);

            globalMax[0] = Math.max(globalMax[0], acc.max[0]);
            globalMax[1] = Math.max(globalMax[1], acc.max[1]);
            globalMax[2] = Math.max(globalMax[2], acc.max[2]);
          }
        }
      });
    }

    if (meshHasBounds) {
      meshBoundsMap.set(meshIdx, { min: meshMin, max: meshMax });
    }
  });

  if (!hasValidBounds) {
    globalMin = [-5, 0, -5];
    globalMax = [5, 3, 5];
  }

  const boundsSize: [number, number, number] = [
    Math.round((globalMax[0] - globalMin[0]) * 100) / 100,
    Math.round((globalMax[1] - globalMin[1]) * 100) / 100,
    Math.round((globalMax[2] - globalMin[2]) * 100) / 100,
  ];

  const boundsCenter: [number, number, number] = [
    Math.round(((globalMin[0] + globalMax[0]) / 2) * 100) / 100,
    Math.round(((globalMin[1] + globalMax[1]) / 2) * 100) / 100,
    Math.round(((globalMin[2] + globalMax[2]) / 2) * 100) / 100,
  ];

  const boundingBox: BoundingBox3D = {
    min: [Math.round(globalMin[0] * 100) / 100, Math.round(globalMin[1] * 100) / 100, Math.round(globalMin[2] * 100) / 100],
    max: [Math.round(globalMax[0] * 100) / 100, Math.round(globalMax[1] * 100) / 100, Math.round(globalMax[2] * 100) / 100],
    size: boundsSize,
    center: boundsCenter,
  };

  // Process Classified Nodes Lists
  const classifiedNodes = {
    rooms: [] as string[],
    floors: [] as string[],
    objects: [] as string[],
    anchors: [] as string[],
    walls: [] as string[],
    windows: [] as string[],
    doors: [] as string[],
    other: [] as string[],
  };

  // Build Flat Node Infos
  const allNodesFlat: NodeInfo[] = rawNodes.map((rawNode, idx) => {
    const nodeName = rawNode.name || `Node_${idx}`;
    const hasMesh = typeof rawNode.mesh === 'number';
    const hasChildren = Array.isArray(rawNode.children) && rawNode.children.length > 0;
    const isEmpty = !hasMesh && !rawNode.camera && !rawNode.extensions?.KHR_lights_punctual;

    let nodeType: NodeInfo['type'] = 'Group';
    if (hasMesh) {
      nodeType = 'Mesh';
    } else if (isEmpty) {
      nodeType = 'Empty';
    } else if (rawNode.camera) {
      nodeType = 'Camera';
    }

    const classification = classifyNodeByName(nodeName);
    const isAnchor = classification === 'ANCHOR' || (isEmpty && /ANCHOR|SENSOR|TAG/i.test(nodeName));

    // Bucket into classified list
    switch (classification) {
      case 'ROOM':
        classifiedNodes.rooms.push(nodeName);
        break;
      case 'FLOOR':
        classifiedNodes.floors.push(nodeName);
        break;
      case 'OBJ':
        classifiedNodes.objects.push(nodeName);
        break;
      case 'ANCHOR':
        classifiedNodes.anchors.push(nodeName);
        break;
      case 'WALL':
        classifiedNodes.walls.push(nodeName);
        break;
      case 'WINDOW':
        classifiedNodes.windows.push(nodeName);
        break;
      case 'DOOR':
        classifiedNodes.doors.push(nodeName);
        break;
      default:
        classifiedNodes.other.push(nodeName);
        break;
    }

    const parentIdx = parentMap.has(idx) ? parentMap.get(idx)! : null;
    const parentName = parentIdx !== null && rawNodes[parentIdx] ? (rawNodes[parentIdx].name || `Node_${parentIdx}`) : null;

    const childrenIndices: number[] = Array.isArray(rawNode.children) ? rawNode.children : [];
    const childrenNames: string[] = childrenIndices.map((cIdx) => rawNodes[cIdx]?.name || `Node_${cIdx}`);

    const transform: NodeTransform = {
      position: rawNode.translation ? [rawNode.translation[0], rawNode.translation[1], rawNode.translation[2]] : [0, 0, 0],
      rotation: rawNode.rotation ? [rawNode.rotation[0], rawNode.rotation[1], rawNode.rotation[2], rawNode.rotation[3]] : [0, 0, 0, 1],
      scale: rawNode.scale ? [rawNode.scale[0], rawNode.scale[1], rawNode.scale[2]] : [1, 1, 1],
    };

    return {
      index: idx,
      name: nodeName,
      type: nodeType,
      classification,
      hasMesh,
      isEmpty,
      isAnchor,
      meshIndex: hasMesh ? rawNode.mesh : undefined,
      parentIndex: parentIdx,
      parentName,
      childrenIndices,
      childrenNames,
      transform,
    };
  });

  // Construct Hierarchical Node Tree
  const nodeMap = new Map<number, NodeInfo>();
  allNodesFlat.forEach((n) => {
    nodeMap.set(n.index, { ...n, children: [] });
  });

  const nodeTree: NodeInfo[] = [];
  const assignedAsChild = new Set<number>();

  allNodesFlat.forEach((node) => {
    const parent = node.parentIndex !== null ? nodeMap.get(node.parentIndex) : null;
    const current = nodeMap.get(node.index)!;
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(current);
      assignedAsChild.add(node.index);
    }
  });

  // Top level nodes are root nodes from default scene, or nodes with no parent
  rootNodeIndices.forEach((rootIdx) => {
    const rootNode = nodeMap.get(rootIdx);
    if (rootNode) {
      nodeTree.push(rootNode);
    }
  });

  // If scene didn't specify roots or empty, fallback to unparented nodes
  if (nodeTree.length === 0) {
    allNodesFlat.forEach((node) => {
      if (!assignedAsChild.has(node.index)) {
        nodeTree.push(nodeMap.get(node.index)!);
      }
    });
  }

  // Parse Meshes
  const meshes: MeshInfo[] = rawMeshes.map((m, idx) => {
    const matIndices = (m.primitives || [])
      .map((p: any) => p.material)
      .filter((matIdx: any) => typeof matIdx === 'number');

    return {
      index: idx,
      name: m.name || `Mesh_${idx}`,
      primitivesCount: (m.primitives || []).length,
      materialIndices: Array.from(new Set(matIndices)),
      boundingBox: meshBoundsMap.get(idx),
    };
  });

  // Parse Materials
  const materials: MaterialInfo[] = rawMaterials.map((mat, idx) => ({
    index: idx,
    name: mat.name || `Material_${idx}`,
  }));

  const rootNodeNames = rootNodeIndices.map((idx) => rawNodes[idx]?.name || `Node_${idx}`);

  const summary: GlbInspectionSummary = {
    totalNodes: allNodesFlat.length,
    totalMeshes: meshes.length,
    totalMaterials: materials.length,
    totalScenes: rawScenes.length || 1,
    totalEmptyAnchors: allNodesFlat.filter((n) => n.isAnchor || n.isEmpty).length,
    totalRoomsDetected: classifiedNodes.rooms.length,
    totalFloorsDetected: classifiedNodes.floors.length,
    totalDevicesDetected: classifiedNodes.objects.length,
  };

  return {
    summary,
    scene: {
      sceneCount: rawScenes.length || 1,
      defaultSceneIndex,
      sceneName: defaultScene.name || 'Scene',
      rootNodeIndices,
      rootNodeNames,
    },
    boundingBox,
    dimensions: {
      x: boundsSize[0],
      y: boundsSize[1],
      z: boundsSize[2],
      unitHint: 'meters (raw glTF units)',
    },
    nodeTree,
    allNodesFlat,
    classifiedNodes,
    meshes,
    materials,
    inspectedAt: new Date().toISOString(),
  };
};

/**
 * Inspects a GLB file stored on disk by reading its buffer
 */
export const inspectGlbFileOnDisk = async (filePath: string): Promise<GlbInspectionResult> => {
  const buffer = await fs.promises.readFile(filePath);
  return inspectGlbBuffer(buffer);
};
