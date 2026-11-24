import { IdentifiedNodeType, IdentificationStatus } from '@prisma/client';
import { prisma } from './db.service.js';
import {
  generateSuggestion,
  isCategoryValidForNodeType,
  createStableNodeId,
  CATEGORY_DISPLAY_NAMES,
} from './identification-engine.service.js';

export interface UpsertIdentificationDto {
  nodeName: string;
  displayName?: string;
  category: string;
  description?: string;
  status?: IdentificationStatus;
}

export interface BulkIdentificationItemDto {
  nodeName: string;
  displayName?: string;
  category?: string;
  status?: IdentificationStatus;
}

export interface BulkIdentificationDto {
  items?: BulkIdentificationItemDto[];
  acceptAllValidSuggestions?: boolean;
  filterNodeType?: IdentifiedNodeType;
  filterFloor?: string;
  filterRoom?: string;
  previewOnly?: boolean;
}

export interface NodeHierarchyMeta {
  parentRoom: string | null;
  parentFloor: string | null;
  path: string[];
}

/**
 * Builds lookup map for resolving actual parent room and floor from GLB allNodesFlat
 */
function buildGlbHierarchyMap(allNodesFlat: any[]): Map<string, NodeHierarchyMeta> {
  const metaMap = new Map<string, NodeHierarchyMeta>();
  const indexToNode = new Map<number, any>();

  allNodesFlat.forEach((n) => {
    indexToNode.set(n.index, n);
  });

  allNodesFlat.forEach((node) => {
    const path: string[] = [node.name];
    let parentRoom: string | null = null;
    let parentFloor: string | null = null;

    let currParentIndex = node.parentIndex;
    while (currParentIndex !== null && currParentIndex !== undefined) {
      const parentNode = indexToNode.get(currParentIndex);
      if (!parentNode) break;

      path.unshift(parentNode.name);

      const pUpper = parentNode.name.toUpperCase();
      if (!parentRoom && (pUpper.startsWith('ROOM_') || parentNode.classification === 'ROOM')) {
        parentRoom = parentNode.name;
      }
      if (!parentFloor && (pUpper.startsWith('FLOOR_') || parentNode.classification === 'FLOOR')) {
        parentFloor = parentNode.name;
      }

      currParentIndex = parentNode.parentIndex;
    }

    metaMap.set(node.name, {
      parentRoom,
      parentFloor,
      path,
    });
  });

  return metaMap;
}

export class NodeIdentificationService {
  /**
   * Automatically initializes suggestion records if not yet created for this model.
   * Ensures nodes are staged in SUGGESTED status awaiting admin confirmation.
   */
  public async ensureModelIdentificationsInitialized(houseModelId: string) {
    const model = await prisma.houseModel.findUnique({
      where: { id: houseModelId },
    });

    if (!model) {
      throw new Error(`House model with ID '${houseModelId}' not found.`);
    }

    const count = await prisma.nodeIdentification.count({
      where: { houseModelId },
    });

    // If records already exist, no need to re-seed
    if (count > 0) return;

    const allNodesFlat: any[] = (model.modelMetadata as any)?.allNodesFlat || [];
    if (allNodesFlat.length === 0) return;

    const hierarchyMap = buildGlbHierarchyMap(allNodesFlat);

    const candidateNodes = allNodesFlat.filter((node) => {
      const upper = node.name.toUpperCase();
      return (
        upper.startsWith('ROOM_') ||
        upper.startsWith('OBJ_') ||
        upper.startsWith('ANCHOR_') ||
        node.isAnchor === true
      );
    });

    const recordsToCreate = candidateNodes.map((node) => {
      const suggestion = generateSuggestion(node.name);
      const hierarchy = hierarchyMap.get(node.name);

      return {
        houseModelId,
        nodeName: node.name,
        stableId: createStableNodeId(houseModelId, node.name),
        displayName: suggestion.suggestedDisplayName,
        nodeType: suggestion.nodeType as IdentifiedNodeType,
        category: suggestion.suggestedCategory,
        suggestedCategory: suggestion.suggestedCategory,
        status: IdentificationStatus.SUGGESTED,
        parentRoom: hierarchy?.parentRoom || null,
        parentFloor: hierarchy?.parentFloor || null,
        revalidationStatus: 'MATCHED',
      };
    });

    if (recordsToCreate.length > 0) {
      await prisma.nodeIdentification.createMany({
        data: recordsToCreate,
        skipDuplicates: true,
      });
    }
  }

  /**
   * Retrieves summary metrics of identified vs unidentified rooms, objects, and anchors
   */
  public async getIdentificationsOverview(houseModelId: string) {
    await this.ensureModelIdentificationsInitialized(houseModelId);

    const records = await prisma.nodeIdentification.findMany({
      where: { houseModelId },
    });

    const overview = {
      rooms: {
        total: 0,
        identified: 0,
        unidentified: 0,
        suggested: 0,
        needsReview: 0,
      },
      objects: {
        total: 0,
        identified: 0,
        unidentified: 0,
        suggested: 0,
        needsReview: 0,
      },
      anchors: {
        total: 0,
        identified: 0,
        unidentified: 0,
        suggested: 0,
        needsReview: 0,
      },
      totalNodes: records.length,
      overallIdentifiedCount: 0,
      overallProgressPercent: 0,
    };

    records.forEach((rec) => {
      let target: typeof overview.rooms;
      if (rec.nodeType === 'ROOM') target = overview.rooms;
      else if (rec.nodeType === 'OBJECT') target = overview.objects;
      else target = overview.anchors;

      target.total++;
      if (rec.status === 'IDENTIFIED') {
        target.identified++;
        overview.overallIdentifiedCount++;
      } else if (rec.status === 'SUGGESTED') {
        target.suggested++;
        target.unidentified++;
      } else if (rec.status === 'NEEDS_REVIEW') {
        target.needsReview++;
        target.unidentified++;
      } else {
        target.unidentified++;
      }
    });

    overview.overallProgressPercent =
      overview.totalNodes > 0
        ? Math.round((overview.overallIdentifiedCount / overview.totalNodes) * 100)
        : 0;

    return overview;
  }

  /**
   * Retrieves list of identifications with optional filtering
   */
  public async getIdentifications(
    houseModelId: string,
    filters?: {
      nodeType?: IdentifiedNodeType;
      status?: IdentificationStatus;
      parentRoom?: string;
      parentFloor?: string;
      search?: string;
    }
  ) {
    await this.ensureModelIdentificationsInitialized(houseModelId);

    const where: any = { houseModelId };

    if (filters?.nodeType) where.nodeType = filters.nodeType;
    if (filters?.status) where.status = filters.status;
    if (filters?.parentRoom) where.parentRoom = filters.parentRoom;
    if (filters?.parentFloor) where.parentFloor = filters.parentFloor;
    if (filters?.search) {
      where.OR = [
        { nodeName: { contains: filters.search, mode: 'insensitive' } },
        { displayName: { contains: filters.search, mode: 'insensitive' } },
        { category: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return prisma.nodeIdentification.findMany({
      where,
      orderBy: [{ nodeType: 'asc' }, { nodeName: 'asc' }],
    });
  }

  /**
   * Retrieves hierarchical tree with identification statuses attached to each node
   */
  public async getIdentificationTree(houseModelId: string) {
    await this.ensureModelIdentificationsInitialized(houseModelId);

    const model = await prisma.houseModel.findUnique({
      where: { id: houseModelId },
    });
    if (!model) throw new Error(`Model not found.`);

    const identifications = await prisma.nodeIdentification.findMany({
      where: { houseModelId },
    });
    const idMap = new Map(identifications.map((i) => [i.nodeName, i]));

    const nodeTree: any[] = (model.modelMetadata as any)?.nodeTree || [];

    // Enrich tree recursively
    const enrichNode = (node: any): any => {
      const ident = idMap.get(node.name);
      return {
        ...node,
        identification: ident || null,
        children: node.children ? node.children.map(enrichNode) : [],
      };
    };

    return nodeTree.map(enrichNode);
  }

  /**
   * Retrieves single identification record by node name
   */
  public async getIdentificationByNode(houseModelId: string, nodeName: string) {
    await this.ensureModelIdentificationsInitialized(houseModelId);

    const record = await prisma.nodeIdentification.findUnique({
      where: {
        houseModelId_nodeName: {
          houseModelId,
          nodeName,
        },
      },
    });

    if (!record) {
      throw new Error(`Node '${nodeName}' not found in identification registry.`);
    }

    return record;
  }

  /**
   * Creates or updates a single node identification
   */
  public async upsertIdentification(houseModelId: string, data: UpsertIdentificationDto) {
    const model = await prisma.houseModel.findUnique({
      where: { id: houseModelId },
    });
    if (!model) throw new Error(`House model with ID '${houseModelId}' not found.`);

    const allNodesFlat: any[] = (model.modelMetadata as any)?.allNodesFlat || [];
    const glbNode = allNodesFlat.find((n) => n.name === data.nodeName);
    if (!glbNode) {
      throw new Error(`Node '${data.nodeName}' does not exist in the 3D model scene graph.`);
    }

    // Determine node type
    const suggestion = generateSuggestion(data.nodeName);
    const nodeType = suggestion.nodeType as IdentifiedNodeType;

    // Validate category against node type
    if (!isCategoryValidForNodeType(nodeType, data.category)) {
      throw new Error(
        `Category '${data.category}' is invalid for node type '${nodeType}'. Please choose a valid ${nodeType} category.`
      );
    }

    // Determine parent room & floor from actual GLB hierarchy
    const hierarchyMap = buildGlbHierarchyMap(allNodesFlat);
    const hierarchy = hierarchyMap.get(data.nodeName);

    const stableId = createStableNodeId(houseModelId, data.nodeName);
    const displayName =
      data.displayName?.trim() ||
      suggestion.suggestedDisplayName ||
      CATEGORY_DISPLAY_NAMES[data.category] ||
      data.nodeName;

    const status = data.status || IdentificationStatus.IDENTIFIED;

    return prisma.nodeIdentification.upsert({
      where: {
        houseModelId_nodeName: {
          houseModelId,
          nodeName: data.nodeName,
        },
      },
      update: {
        displayName,
        category: data.category,
        description: data.description?.trim() || null,
        status,
        parentRoom: hierarchy?.parentRoom || null,
        parentFloor: hierarchy?.parentFloor || null,
        revalidationStatus: 'MATCHED',
      },
      create: {
        houseModelId,
        nodeName: data.nodeName,
        stableId,
        displayName,
        nodeType,
        category: data.category,
        suggestedCategory: suggestion.suggestedCategory,
        status,
        description: data.description?.trim() || null,
        parentRoom: hierarchy?.parentRoom || null,
        parentFloor: hierarchy?.parentFloor || null,
        revalidationStatus: 'MATCHED',
      },
    });
  }

  /**
   * Performs bulk confirmation or modification of identifications with optional preview
   */
  public async bulkUpdateIdentifications(houseModelId: string, dto: BulkIdentificationDto) {
    await this.ensureModelIdentificationsInitialized(houseModelId);

    const where: any = { houseModelId };
    if (dto.filterNodeType) where.nodeType = dto.filterNodeType;
    if (dto.filterFloor) where.parentFloor = dto.filterFloor;
    if (dto.filterRoom) where.parentRoom = dto.filterRoom;

    let targets = await prisma.nodeIdentification.findMany({ where });

    // If explicit item list provided, filter to those node names
    if (dto.items && dto.items.length > 0) {
      const itemMap = new Map(dto.items.map((it) => [it.nodeName, it]));
      targets = targets.filter((t) => itemMap.has(t.nodeName));
    }

    // Prepare preview of changes
    const previewList = targets.map((rec) => {
      const explicit = dto.items?.find((i) => i.nodeName === rec.nodeName);
      const newCategory = explicit?.category || rec.suggestedCategory || rec.category;
      const newDisplayName = explicit?.displayName || rec.displayName;
      const newStatus = explicit?.status || IdentificationStatus.IDENTIFIED;

      const isValid = isCategoryValidForNodeType(rec.nodeType, newCategory);

      return {
        id: rec.id,
        nodeName: rec.nodeName,
        nodeType: rec.nodeType,
        currentCategory: rec.category,
        newCategory,
        currentDisplayName: rec.displayName,
        newDisplayName,
        currentStatus: rec.status,
        newStatus,
        parentRoom: rec.parentRoom,
        parentFloor: rec.parentFloor,
        isValid,
      };
    });

    // If preview only, return immediately without database modification
    if (dto.previewOnly) {
      return {
        preview: true,
        totalCandidates: previewList.length,
        validCount: previewList.filter((p) => p.isValid).length,
        items: previewList,
      };
    }

    // Apply bulk updates inside a transaction
    const validItems = previewList.filter((p) => p.isValid);

    const updatePromises = validItems.map((item) =>
      prisma.nodeIdentification.update({
        where: { id: item.id },
        data: {
          category: item.newCategory,
          displayName: item.newDisplayName,
          status: item.newStatus,
          revalidationStatus: 'MATCHED',
        },
      })
    );

    const updated = await prisma.$transaction(updatePromises);

    return {
      success: true,
      updatedCount: updated.length,
      items: previewList,
    };
  }

  /**
   * Revalidates stored identifications against current GLB structure
   * Detects MATCHED, NEW_NODE, MISSING_NODE, and hierarchy changes (NEEDS_REVIEW)
   */
  public async revalidateIdentifications(houseModelId: string) {
    const model = await prisma.houseModel.findUnique({
      where: { id: houseModelId },
    });
    if (!model) throw new Error(`Model not found.`);

    const allNodesFlat: any[] = (model.modelMetadata as any)?.allNodesFlat || [];
    const glbNodeMap = new Map(allNodesFlat.map((n) => [n.name, n]));
    const hierarchyMap = buildGlbHierarchyMap(allNodesFlat);

    const storedRecords = await prisma.nodeIdentification.findMany({
      where: { houseModelId },
    });
    const storedMap = new Map(storedRecords.map((r) => [r.nodeName, r]));

    const report = {
      matched: [] as string[],
      newNodes: [] as string[],
      missingNodes: [] as string[],
      needsReview: [] as { nodeName: string; reason: string }[],
    };

    // 1. Check existing stored records against GLB
    for (const record of storedRecords) {
      const glbNode = glbNodeMap.get(record.nodeName);

      if (!glbNode) {
        // Node was removed from GLB
        report.missingNodes.push(record.nodeName);
        await prisma.nodeIdentification.update({
          where: { id: record.id },
          data: {
            revalidationStatus: 'MISSING_NODE',
            status: IdentificationStatus.NEEDS_REVIEW,
          },
        });
      } else {
        // Node still exists — check if parent hierarchy changed
        const currentHierarchy = hierarchyMap.get(record.nodeName);
        const hierarchyChanged =
          (currentHierarchy?.parentRoom || null) !== (record.parentRoom || null) ||
          (currentHierarchy?.parentFloor || null) !== (record.parentFloor || null);

        if (hierarchyChanged) {
          report.needsReview.push({
            nodeName: record.nodeName,
            reason: `Hierarchy changed: Room [${record.parentRoom} -> ${currentHierarchy?.parentRoom}], Floor [${record.parentFloor} -> ${currentHierarchy?.parentFloor}]`,
          });
          await prisma.nodeIdentification.update({
            where: { id: record.id },
            data: {
              parentRoom: currentHierarchy?.parentRoom || null,
              parentFloor: currentHierarchy?.parentFloor || null,
              revalidationStatus: 'NEEDS_REVIEW',
              status: IdentificationStatus.NEEDS_REVIEW,
            },
          });
        } else {
          report.matched.push(record.nodeName);
          await prisma.nodeIdentification.update({
            where: { id: record.id },
            data: { revalidationStatus: 'MATCHED' },
          });
        }
      }
    }

    // 2. Check for newly introduced nodes in GLB
    for (const glbNode of allNodesFlat) {
      const upper = glbNode.name.toUpperCase();
      const isCandidate =
        upper.startsWith('ROOM_') ||
        upper.startsWith('OBJ_') ||
        upper.startsWith('ANCHOR_') ||
        glbNode.isAnchor === true;

      if (isCandidate && !storedMap.has(glbNode.name)) {
        report.newNodes.push(glbNode.name);
        const suggestion = generateSuggestion(glbNode.name);
        const hierarchy = hierarchyMap.get(glbNode.name);

        await prisma.nodeIdentification.create({
          data: {
            houseModelId,
            nodeName: glbNode.name,
            stableId: createStableNodeId(houseModelId, glbNode.name),
            displayName: suggestion.suggestedDisplayName,
            nodeType: suggestion.nodeType as IdentifiedNodeType,
            category: suggestion.suggestedCategory,
            suggestedCategory: suggestion.suggestedCategory,
            status: IdentificationStatus.SUGGESTED,
            parentRoom: hierarchy?.parentRoom || null,
            parentFloor: hierarchy?.parentFloor || null,
            revalidationStatus: 'NEW_NODE',
          },
        });
      }
    }

    return {
      summary: {
        totalMatched: report.matched.length,
        totalNew: report.newNodes.length,
        totalMissing: report.missingNodes.length,
        totalNeedsReview: report.needsReview.length,
      },
      details: report,
    };
  }
}

export const nodeIdentificationService = new NodeIdentificationService();

