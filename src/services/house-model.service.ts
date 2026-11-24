import fs from 'fs';
import path from 'path';
import { prisma } from './db.service.js';
import { config } from '../config/env.js';
import { validateGlbFileOnDisk } from '../utils/glb-validator.js';
import { inspectGlbFileOnDisk, GlbInspectionResult } from './glb-inspector.service.js';
import { ModelStatus } from '@prisma/client';
import { resolveUploadPath, isPathContained, UPLOADS_DIR, ROOT_UPLOADS_DIR } from '../utils/storage-path.util.js';

export interface ListHouseModelsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: ModelStatus;
}

export interface CreateHouseModelInput {
  name: string;
  description?: string;
  file: Express.Multer.File;
}

export interface UpdateHouseModelInput {
  name?: string;
  description?: string;
  status?: ModelStatus;
}

export class HouseModelService {
  /**
   * Retrieves paginated list of house models with optional search and status filtering
   */
  async listHouseModels(options: ListHouseModelsOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 12));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options.status) {
      where.status = options.status;
    }

    if (options.search && options.search.trim()) {
      where.OR = [
        { name: { contains: options.search.trim(), mode: 'insensitive' } },
        { description: { contains: options.search.trim(), mode: 'insensitive' } },
        { fileName: { contains: options.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, models] = await Promise.all([
      prisma.houseModel.count({ where }),
      prisma.houseModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      models,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single house model by ID
   */
  async getHouseModelById(id: string) {
    return prisma.houseModel.findUnique({
      where: { id },
      include: {
        rooms: true,
      },
    });
  }

  /**
   * Handles GLB file upload, binary signature validation, inspection, and DB persistence
   */
  async createHouseModel(input: CreateHouseModelInput) {
    const { name, description, file } = input;

    if (!file) {
      throw new Error('GLB file is required');
    }

    const absoluteFilePath = path.resolve(file.path);

    // 1. Validate binary GLB signature & format integrity
    const validation = await validateGlbFileOnDisk(absoluteFilePath);
    if (!validation.isValid) {
      // Remove invalid uploaded file immediately
      await this.safeDeleteFile(absoluteFilePath);
      throw new Error(`Invalid GLB file: ${validation.error}`);
    }

    // 2. Perform deep inspection of the GLB model
    let inspectionResult: GlbInspectionResult | null = null;
    try {
      inspectionResult = await inspectGlbFileOnDisk(absoluteFilePath);
    } catch (err: any) {
      // If inspection fails during creation, clean up file
      await this.safeDeleteFile(absoluteFilePath);
      throw new Error(`Failed to inspect GLB model structure: ${err?.message || err}`);
    }

    // 3. Normalize relative storage path for DB reference
    const relativeFilePath = path
      .relative(process.cwd(), absoluteFilePath)
      .replace(/\\/g, '/');

    try {
      // 4. Save metadata and inspection manifest to PostgreSQL
      const createdModel = await prisma.houseModel.create({
        data: {
          name: name.trim(),
          description: description ? description.trim() : null,
          fileName: file.originalname,
          filePath: relativeFilePath,
          fileSize: file.size,
          mimeType: 'model/gltf-binary',
          status: 'DRAFT',
          modelMetadata: inspectionResult as any,
        },
      });

      return createdModel;
    } catch (dbError: any) {
      // Clean up physical file if database transaction fails
      await this.safeDeleteFile(absoluteFilePath);
      throw new Error(`Database error saving house model: ${dbError?.message || dbError}`);
    }
  }

  /**
   * Updates house model metadata
   */
  async updateHouseModel(id: string, input: UpdateHouseModelInput) {
    const existing = await prisma.houseModel.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`House model with ID '${id}' not found`);
    }

    return prisma.houseModel.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim() || null,
        }),
        ...(input.status !== undefined && { status: input.status }),
      },
    });
  }

  /**
   * Deletes model record and associated storage files
   */
  async deleteHouseModel(id: string) {
    const existing = await prisma.houseModel.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`House model with ID '${id}' not found`);
    }

    // Delete record from DB
    await prisma.houseModel.delete({ where: { id } });

    // Safely delete file from disk
    const absolutePath = path.resolve(process.cwd(), existing.filePath);
    await this.safeDeleteFile(absolutePath);

    if (existing.thumbnailPath) {
      const thumbPath = path.resolve(process.cwd(), existing.thumbnailPath);
      await this.safeDeleteFile(thumbPath);
    }

    return { id, name: existing.name, deleted: true };
  }

  /**
   * Re-inspects an existing house model from its disk file
   */
  async inspectHouseModel(id: string) {
    const existing = await prisma.houseModel.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`House model with ID '${id}' not found`);
    }

    const absolutePath = path.resolve(process.cwd(), existing.filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`GLB file not found on disk at '${existing.filePath}'`);
    }

    const inspection = await inspectGlbFileOnDisk(absolutePath);

    const updated = await prisma.houseModel.update({
      where: { id },
      data: {
        modelMetadata: inspection as any,
      },
    });

    return { model: updated, inspection };
  }

  /**
   * Retrieves verified absolute path for file streaming with path traversal protection
   */
  async getModelFilePath(id: string): Promise<{ absolutePath: string; fileName: string; mimeType: string; fileSize: number }> {
    const existing = await prisma.houseModel.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`House model with ID '${id}' not found`);
    }

    const absolutePath = resolveUploadPath(existing.filePath) || path.resolve(process.cwd(), existing.filePath);

    // Path traversal check: verify the resolved path starts with the allowed storage directories
    const allowedRoots = [
      path.resolve(config.modelsStorageDir),
      path.resolve(UPLOADS_DIR),
      path.resolve(ROOT_UPLOADS_DIR),
    ];
    if (!isPathContained(absolutePath, allowedRoots)) {
      throw new Error('Access denied: Unauthorized file path');
    }

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`GLB model file does not exist on disk`);
    }

    const resolvedMimeType =
      existing.fileName?.toLowerCase().endsWith('.glb') || existing.filePath?.toLowerCase().endsWith('.glb')
        ? 'model/gltf-binary'
        : existing.fileName?.toLowerCase().endsWith('.gltf') || existing.filePath?.toLowerCase().endsWith('.gltf')
        ? 'model/gltf+json'
        : existing.mimeType || 'application/octet-stream';

    return {
      absolutePath,
      fileName: existing.fileName,
      mimeType: resolvedMimeType,
      fileSize: existing.fileSize,
    };
  }

  /**
   * Safe file deletion helper
   */
  private async safeDeleteFile(targetPath: string): Promise<void> {
    try {
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
      }
    } catch (err) {
      console.warn(`[HouseModelService] Warning: Could not delete file '${targetPath}':`, err);
    }
  }
}

export const houseModelService = new HouseModelService();
