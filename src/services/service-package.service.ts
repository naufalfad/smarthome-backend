/**
 * PHASE 6: COMMERCIAL SERVICE PACKAGE CATALOG SERVICE
 *
 * Implements administrative package lifecycle (CRUD, activation, deactivation, archival),
 * structured inclusion management, atomic database transactions, price validation with
 * PostgreSQL Decimal(12, 2) precision, and customer-facing active package catalog.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './db.service.js';
import { AppError } from '../middlewares/error.middleware.js';

export type PackageStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type ServiceInclusionCategory =
  | 'PROPERTY_SURVEY'
  | 'FLOOR_PLAN_2D'
  | 'IOT_DEVICE_CONFIGURATION'
  | 'IOT_DEVICE_INSTALLATION'
  | 'AUTOMATION_CONFIGURATION'
  | 'SMART_HOME_DASHBOARD'
  | 'THREE_D_MODEL'
  | 'GLB_ASSET_PREPARATION'
  | 'TRAINING_AND_HANDOVER'
  | 'OTHER';

export interface CreateInclusionInput {
  category?: ServiceInclusionCategory;
  displayName: string;
  description?: string | null;
  isIncluded?: boolean;
  quantity?: number | null;
  metadata?: any;
  displayOrder?: number;
}

export interface CreatePackageInput {
  name: string;
  code: string;
  shortDescription: string;
  description: string;
  price: number | string | Prisma.Decimal;
  currency?: string;
  estimatedDuration?: string | null;
  status?: PackageStatus;
  displayOrder?: number;
  imageUrl?: string | null;
  maxRooms?: number | null;
  maxDevices?: number | null;
  includedAutomations?: number | null;
  hasPhysicalIot?: boolean;
  hasThreeD?: boolean;
  inclusions?: CreateInclusionInput[];
}

export interface UpdatePackageInput {
  name?: string;
  code?: string;
  shortDescription?: string;
  description?: string;
  price?: number | string | Prisma.Decimal;
  currency?: string;
  estimatedDuration?: string | null;
  displayOrder?: number;
  imageUrl?: string | null;
  maxRooms?: number | null;
  maxDevices?: number | null;
  includedAutomations?: number | null;
  hasPhysicalIot?: boolean;
  hasThreeD?: boolean;
  inclusions?: CreateInclusionInput[];
}

export interface ListPackagesFilter {
  status?: PackageStatus;
  search?: string;
  hasPhysicalIot?: boolean;
  hasThreeD?: boolean;
}

export class ServicePackageService {
  /**
   * Helper to format currency into Indonesian Rupiah display
   */
  public formatRupiah(amount: number | string | Prisma.Decimal): string {
    const numeric = typeof amount === 'number' ? amount : Number(amount);
    if (isNaN(numeric)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(numeric);
  }

  /**
   * Serializes a package entity with canonical decimal string and formatted price values
   */
  public serializePackage(pkg: any) {
    if (!pkg) return null;
    let decimalStr = '0.00';
    if (pkg.price instanceof Prisma.Decimal) {
      decimalStr = pkg.price.toFixed(2);
    } else if (typeof pkg.price === 'string') {
      decimalStr = new Prisma.Decimal(pkg.price).toFixed(2);
    } else if (typeof pkg.price === 'number') {
      decimalStr = new Prisma.Decimal(pkg.price.toString()).toFixed(2);
    }

    return {
      ...pkg,
      price: decimalStr, // Canonical decimal string e.g. "4999999.75"
      formattedPrice: this.formatRupiah(pkg.price),
    };
  }

  /**
   * Validates a package code/slug format (lowercase alphanumeric and dashes)
   */
  public validateCodeFormat(code: string): string {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) {
      throw new AppError("Kode paket ('code') wajib diisi.", 400);
    }
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(trimmed)) {
      throw new AppError(
        "Format kode paket tidak valid. Gunakan huruf kecil, angka, dan tanda hubung (-) tanpa spasi (e.g. 'smart-home-pro').",
        400
      );
    }
    return trimmed;
  }

  /**
   * Validates and parses a monetary price value without JavaScript floating-point arithmetic.
   * Accepts decimal strings or numbers, validates exact format (up to 2 decimal places),
   * rejects negative numbers, excessive decimal places, and values exceeding maximum.
   * Returns a canonical Prisma.Decimal instance constructed directly from the validated string.
   */
  public validatePrice(price: any): Prisma.Decimal {
    if (price === undefined || price === null || price === '') {
      throw new AppError('Harga paket wajib diisi.', 400);
    }

    let rawStr = '';
    if (typeof price === 'string') {
      rawStr = price.trim();
    } else if (typeof price === 'number') {
      if (!Number.isFinite(price) || isNaN(price)) {
        throw new AppError('Harga paket harus berupa nilai numerik valid.', 400);
      }
      if (price < 0) {
        throw new AppError('Harga paket tidak boleh bernilai negatif.', 400);
      }
      rawStr = price.toString();
    } else if (price instanceof Prisma.Decimal) {
      rawStr = price.toString();
    } else {
      throw new AppError('Format harga paket tidak valid.', 400);
    }

    if (!rawStr) {
      throw new AppError('Harga paket wajib diisi.', 400);
    }

    // Reject negative sign
    if (rawStr.startsWith('-') || rawStr.includes('-')) {
      throw new AppError('Harga paket tidak boleh bernilai negatif.', 400);
    }

    // Check for excessive decimal places (more than 2 decimal digits)
    if (/^\d+\.\d{3,}$/.test(rawStr)) {
      throw new AppError(
        'Format harga tidak valid: maksimal 2 angka desimal di belakang koma (tidak boleh dibulatkan otomatis).',
        400
      );
    }

    // Validate standard decimal format: non-negative integer or with 1-2 decimal places
    const validDecimalRegex = /^\d+(\.\d{1,2})?$/;
    if (!validDecimalRegex.test(rawStr)) {
      throw new AppError(
        'Harga paket harus berupa nilai desimal atau bilangan bulat non-negatif yang valid (e.g. 1500000 atau 4999999.75).',
        400
      );
    }

    // Normalize string representation to exactly 2 decimal places
    let canonicalStr = rawStr;
    if (!canonicalStr.includes('.')) {
      canonicalStr += '.00';
    } else {
      const [intPart, decPart] = canonicalStr.split('.');
      if (decPart.length === 1) {
        canonicalStr = `${intPart}.${decPart}0`;
      }
    }

    const decimalValue = new Prisma.Decimal(canonicalStr);
    const maxAllowed = new Prisma.Decimal('999999999.99');

    if (decimalValue.greaterThan(maxAllowed)) {
      throw new AppError('Harga paket melebihi batas maksimum yang diizinkan (maksimal 999.999.999,99).', 400);
    }

    return decimalValue;
  }

  /**
   * Validates inclusions input structure
   */
  public validateInclusions(inclusions?: CreateInclusionInput[]): CreateInclusionInput[] {
    if (!inclusions || !Array.isArray(inclusions)) {
      return [];
    }
    const validCategories: ServiceInclusionCategory[] = [
      'PROPERTY_SURVEY',
      'FLOOR_PLAN_2D',
      'IOT_DEVICE_CONFIGURATION',
      'IOT_DEVICE_INSTALLATION',
      'AUTOMATION_CONFIGURATION',
      'SMART_HOME_DASHBOARD',
      'THREE_D_MODEL',
      'GLB_ASSET_PREPARATION',
      'TRAINING_AND_HANDOVER',
      'OTHER',
    ];

    return inclusions.map((inc, index) => {
      if (!inc.displayName || typeof inc.displayName !== 'string' || !inc.displayName.trim()) {
        throw new AppError(`Inklusi pada indeks ${index} wajib memiliki 'displayName'.`, 400);
      }
      const category = inc.category || 'OTHER';
      if (!validCategories.includes(category)) {
        throw new AppError(
          `Kategori inklusi '${category}' pada indeks ${index} tidak valid. Kategori yang didukung: ${validCategories.join(', ')}.`,
          400
        );
      }
      if (inc.quantity !== undefined && inc.quantity !== null && (typeof inc.quantity !== 'number' || inc.quantity < 0)) {
        throw new AppError(`Kuantitas inklusi pada indeks ${index} harus berupa bilangan bulat non-negatif.`, 400);
      }
      return {
        category,
        displayName: inc.displayName.trim(),
        description: inc.description?.trim() || null,
        isIncluded: inc.isIncluded !== false,
        quantity: inc.quantity ?? null,
        metadata: inc.metadata ?? null,
        displayOrder: inc.displayOrder ?? index,
      };
    });
  }

  // =========================================================================
  // SUPER ADMIN OPERATIONS
  // =========================================================================

  /**
   * Lists all packages for Super Admin with optional filters
   */
  async listAdminPackages(filter?: ListPackagesFilter) {
    const where: Prisma.ServicePackageWhereInput = {};

    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.hasPhysicalIot !== undefined) {
      where.hasPhysicalIot = filter.hasPhysicalIot;
    }
    if (filter?.hasThreeD !== undefined) {
      where.hasThreeD = filter.hasThreeD;
    }
    if (filter?.search && filter.search.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { shortDescription: { contains: q, mode: 'insensitive' } },
      ];
    }

    const packages = await prisma.servicePackage.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: {
        inclusions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return packages.map((pkg) => this.serializePackage(pkg));
  }

  /**
   * Retrieves single package details for Super Admin
   */
  async getAdminPackageById(id: string) {
    const pkg = await prisma.servicePackage.findUnique({
      where: { id },
      include: {
        inclusions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!pkg) {
      throw new AppError(`Paket layanan dengan ID '${id}' tidak ditemukan.`, 404);
    }

    return this.serializePackage(pkg);
  }

  /**
   * Creates a new package along with inclusions atomically
   */
  async createPackage(input: CreatePackageInput) {
    const name = input.name?.trim();
    if (!name || name.length < 3) {
      throw new AppError("Nama paket ('name') wajib diisi minimal 3 karakter.", 400);
    }

    const code = this.validateCodeFormat(input.code);
    const existingCode = await prisma.servicePackage.findUnique({ where: { code } });
    if (existingCode) {
      throw new AppError(`Kode paket '${code}' sudah digunakan oleh paket lain. Gunakan kode unik.`, 409);
    }

    const price = this.validatePrice(input.price);
    const shortDescription = input.shortDescription?.trim() || '';
    if (!shortDescription) {
      throw new AppError("Deskripsi singkat ('shortDescription') wajib diisi.", 400);
    }
    const description = input.description?.trim() || shortDescription;
    const validatedInclusions = this.validateInclusions(input.inclusions);

    const validStatuses: PackageStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];
    const status: PackageStatus = input.status && validStatuses.includes(input.status) ? input.status : 'DRAFT';

    const created = await prisma.$transaction(async (tx) => {
      const pkg = await tx.servicePackage.create({
        data: {
          name,
          code,
          shortDescription,
          description,
          price,
          currency: input.currency || 'IDR',
          estimatedDuration: input.estimatedDuration?.trim() || null,
          status,
          displayOrder: input.displayOrder ?? 0,
          imageUrl: input.imageUrl?.trim() || null,
          maxRooms: input.maxRooms ?? null,
          maxDevices: input.maxDevices ?? null,
          includedAutomations: input.includedAutomations ?? null,
          hasPhysicalIot: input.hasPhysicalIot === true,
          hasThreeD: input.hasThreeD === true,
          inclusions: {
            create: validatedInclusions.map((inc) => ({
              category: inc.category,
              displayName: inc.displayName,
              description: inc.description,
              isIncluded: inc.isIncluded,
              quantity: inc.quantity,
              metadata: inc.metadata,
              displayOrder: inc.displayOrder,
            })),
          },
        },
        include: {
          inclusions: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
      return pkg;
    });

    return this.serializePackage(created);
  }

  /**
   * Updates package details and synchronizes inclusions atomically
   */
  async updatePackage(id: string, input: UpdatePackageInput) {
    const existing = await prisma.servicePackage.findUnique({
      where: { id },
      include: { inclusions: true },
    });

    if (!existing) {
      throw new AppError(`Paket layanan dengan ID '${id}' tidak ditemukan.`, 404);
    }

    if (existing.status === 'ARCHIVED') {
      throw new AppError('Paket yang telah diarsipkan (ARCHIVED) tidak dapat diubah.', 400);
    }

    const updateData: Prisma.ServicePackageUpdateInput = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length < 3) {
        throw new AppError("Nama paket ('name') minimal 3 karakter.", 400);
      }
      updateData.name = name;
    }

    if (input.code !== undefined) {
      const code = this.validateCodeFormat(input.code);
      if (code !== existing.code) {
        const duplicate = await prisma.servicePackage.findUnique({ where: { code } });
        if (duplicate) {
          throw new AppError(`Kode paket '${code}' sudah digunakan oleh paket lain.`, 409);
        }
        updateData.code = code;
      }
    }

    if (input.price !== undefined) {
      updateData.price = this.validatePrice(input.price);
    }

    if (input.shortDescription !== undefined) {
      updateData.shortDescription = input.shortDescription.trim();
    }

    if (input.description !== undefined) {
      updateData.description = input.description.trim();
    }

    if (input.currency !== undefined) {
      updateData.currency = input.currency.trim() || 'IDR';
    }

    if (input.estimatedDuration !== undefined) {
      updateData.estimatedDuration = input.estimatedDuration?.trim() || null;
    }

    if (input.displayOrder !== undefined) {
      updateData.displayOrder = input.displayOrder;
    }

    if (input.imageUrl !== undefined) {
      updateData.imageUrl = input.imageUrl?.trim() || null;
    }

    if (input.maxRooms !== undefined) {
      updateData.maxRooms = input.maxRooms ?? null;
    }

    if (input.maxDevices !== undefined) {
      updateData.maxDevices = input.maxDevices ?? null;
    }

    if (input.includedAutomations !== undefined) {
      updateData.includedAutomations = input.includedAutomations ?? null;
    }

    if (input.hasPhysicalIot !== undefined) {
      updateData.hasPhysicalIot = input.hasPhysicalIot === true;
    }

    if (input.hasThreeD !== undefined) {
      updateData.hasThreeD = input.hasThreeD === true;
    }

    const validatedInclusions =
      input.inclusions !== undefined ? this.validateInclusions(input.inclusions) : null;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. If inclusions provided, replace them atomically
      if (validatedInclusions !== null) {
        await tx.servicePackageInclusion.deleteMany({ where: { packageId: id } });
        if (validatedInclusions.length > 0) {
          await tx.servicePackageInclusion.createMany({
            data: validatedInclusions.map((inc) => ({
              packageId: id,
              category: inc.category,
              displayName: inc.displayName,
              description: inc.description,
              isIncluded: inc.isIncluded,
              quantity: inc.quantity,
              metadata: inc.metadata,
              displayOrder: inc.displayOrder,
            })),
          });
        }
      }

      // 2. Update package root fields
      const pkg = await tx.servicePackage.update({
        where: { id },
        data: updateData,
        include: {
          inclusions: {
            orderBy: { displayOrder: 'asc' },
          },
        },
      });

      return pkg;
    });

    return this.serializePackage(updated);
  }

  /**
   * Enforces validated status transitions
   */
  async updatePackageStatus(id: string, newStatus: PackageStatus) {
    const existing = await prisma.servicePackage.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(`Paket layanan dengan ID '${id}' tidak ditemukan.`, 404);
    }

    const currentStatus = existing.status;
    if (currentStatus === newStatus) {
      return this.serializePackage(existing);
    }

    // Archived is a terminal state to preserve historical integrity
    if (currentStatus === 'ARCHIVED') {
      throw new AppError(
        'Paket yang telah diarsipkan (ARCHIVED) tidak dapat diaktifkan atau diubah kembali statusnya.',
        400
      );
    }

    const allowedTransitions: Record<PackageStatus, PackageStatus[]> = {
      DRAFT: ['ACTIVE', 'ARCHIVED'],
      ACTIVE: ['INACTIVE', 'ARCHIVED'],
      INACTIVE: ['ACTIVE', 'ARCHIVED'],
      ARCHIVED: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
      throw new AppError(
        `Transisi status tidak valid: Tidak dapat mengubah status paket dari '${currentStatus}' menjadi '${newStatus}'.`,
        400
      );
    }

    const updated = await prisma.servicePackage.update({
      where: { id },
      data: { status: newStatus },
      include: {
        inclusions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return this.serializePackage(updated);
  }

  /**
   * Activate package
   */
  async activatePackage(id: string) {
    return this.updatePackageStatus(id, 'ACTIVE');
  }

  /**
   * Deactivate package
   */
  async deactivatePackage(id: string) {
    return this.updatePackageStatus(id, 'INACTIVE');
  }

  /**
   * Archive package (safe alternative to deletion)
   */
  async archivePackage(id: string) {
    return this.updatePackageStatus(id, 'ARCHIVED');
  }

  /**
   * Safe deletion helper: Only allowed for DRAFT packages that have never been activated
   */
  async deletePackage(id: string) {
    const existing = await prisma.servicePackage.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(`Paket layanan dengan ID '${id}' tidak ditemukan.`, 404);
    }

    if (existing.status !== 'DRAFT') {
      throw new AppError(
        `Penghapusan permanen ditolak: Paket dengan status '${existing.status}' tidak boleh dihapus. Gunakan fitur pengarsipan (Archive) untuk menjaga integritas data historis.`,
        400
      );
    }

    await prisma.servicePackage.delete({ where: { id } });
    return { success: true, message: `Paket '${existing.name}' berhasil dihapus permanen.` };
  }

  // =========================================================================
  // CUSTOMER CATALOG OPERATIONS (READ-ONLY, ACTIVE PACKAGES ONLY)
  // =========================================================================

  /**
   * Lists available ACTIVE packages for customers
   */
  async listActiveCatalogPackages() {
    const packages = await prisma.servicePackage.findMany({
      where: {
        status: 'ACTIVE',
      },
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
      include: {
        inclusions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    return packages.map((pkg) => this.serializePackage(pkg));
  }

  /**
   * Gets details of a single ACTIVE package for customer by ID or code slug
   */
  async getActiveCatalogPackageById(idOrSlug: string) {
    const pkg = await prisma.servicePackage.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [{ id: idOrSlug }, { code: idOrSlug.toLowerCase() }],
      },
      include: {
        inclusions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!pkg) {
      throw new AppError('Paket layanan tidak ditemukan atau tidak tersedia.', 404);
    }

    return this.serializePackage(pkg);
  }
}

export const servicePackageService = new ServicePackageService();
