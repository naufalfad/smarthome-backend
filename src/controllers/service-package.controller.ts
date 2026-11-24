/**
 * PHASE 6: COMMERCIAL SERVICE PACKAGE CONTROLLER
 *
 * Implements Super Admin package management endpoints and
 * Customer-facing active package catalog endpoints.
 */

import { Request, Response, NextFunction } from 'express';
import { servicePackageService, PackageStatus } from '../services/service-package.service.js';

/**
 * Enforces strict anti-caching HTTP headers on package and catalog endpoints
 * to guarantee that web browsers, service workers, and proxies never serve stale state.
 */
function setNoCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

// =========================================================================
// SUPER ADMIN HANDLERS
// =========================================================================

export async function listAdminPackages(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const status = req.query.status as PackageStatus | undefined;
    const search = req.query.search as string | undefined;
    const hasPhysicalIot =
      req.query.hasPhysicalIot !== undefined ? req.query.hasPhysicalIot === 'true' : undefined;
    const hasThreeD = req.query.hasThreeD !== undefined ? req.query.hasThreeD === 'true' : undefined;

    const packages = await servicePackageService.listAdminPackages({
      status,
      search,
      hasPhysicalIot,
      hasThreeD,
    });

    res.json({
      success: true,
      data: packages,
      message: 'Daftar paket layanan berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminPackageById(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const id = req.params.id as string;
    const pkg = await servicePackageService.getAdminPackageById(id);
    res.json({
      success: true,
      data: pkg,
      message: 'Detail paket layanan berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}

export async function createPackage(req: Request, res: Response, next: NextFunction) {
  try {
    const pkg = await servicePackageService.createPackage(req.body);
    res.status(201).json({
      success: true,
      data: pkg,
      message: `Paket layanan '${pkg.name}' berhasil dibuat.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function updatePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const pkg = await servicePackageService.updatePackage(id, req.body);
    res.json({
      success: true,
      data: pkg,
      message: `Paket layanan '${pkg.name}' berhasil diperbarui.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function activatePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const pkg = await servicePackageService.activatePackage(id);
    res.json({
      success: true,
      data: pkg,
      message: `Paket layanan '${pkg.name}' berhasil diaktifkan dan kini tayang pada katalog pelanggan.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function deactivatePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const pkg = await servicePackageService.deactivatePackage(id);
    res.json({
      success: true,
      data: pkg,
      message: `Paket layanan '${pkg.name}' berhasil dinonaktifkan (disembunyikan dari katalog pelanggan).`,
    });
  } catch (err) {
    next(err);
  }
}

export async function archivePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const pkg = await servicePackageService.archivePackage(id);
    res.json({
      success: true,
      data: pkg,
      message: `Paket layanan '${pkg.name}' berhasil diarsipkan.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function deletePackage(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const result = await servicePackageService.deletePackage(id);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// CUSTOMER CATALOG HANDLERS (ACTIVE PACKAGES ONLY)
// =========================================================================

export async function listCatalogPackages(_req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const packages = await servicePackageService.listActiveCatalogPackages();
    res.json({
      success: true,
      data: packages,
      message: 'Katalog paket layanan aktif berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}

export async function getCatalogPackageById(req: Request, res: Response, next: NextFunction) {
  try {
    setNoCacheHeaders(res);
    const idOrSlug = req.params.id as string;
    const pkg = await servicePackageService.getActiveCatalogPackageById(idOrSlug);
    res.json({
      success: true,
      data: pkg,
      message: 'Detail paket layanan aktif berhasil diambil.',
    });
  } catch (err) {
    next(err);
  }
}
