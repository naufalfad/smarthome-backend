import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';

// Resolve directory of current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In dev (src/utils) or prod (dist/utils), backend root is 2 levels up
export const BACKEND_ROOT = path.resolve(__dirname, '../..');

// Project root is either BACKEND_ROOT or its parent if inside 'backend' folder
export const PROJECT_ROOT = path.basename(BACKEND_ROOT) === 'backend'
  ? path.resolve(BACKEND_ROOT, '..')
  : BACKEND_ROOT;

// Canonical upload root (strictly inside backend/uploads)
export const UPLOADS_DIR = path.resolve(BACKEND_ROOT, 'uploads');
export const CANONICAL_UPLOADS_DIR = UPLOADS_DIR;

// Canonical subdirectories
export const FLOOR_PLANS_DIR = path.resolve(UPLOADS_DIR, 'floor-plans');
export const HOUSE_MODELS_DIR = path.resolve(UPLOADS_DIR, 'house-models');
export const THUMBNAILS_DIR = path.resolve(UPLOADS_DIR, 'thumbnails');
export const SURVEYS_DIR = path.resolve(UPLOADS_DIR, 'surveys');
export const MODELS_3D_DIR = path.resolve(UPLOADS_DIR, 'models-3d');
export const DEVICES_3D_DIR = path.resolve(MODELS_3D_DIR, 'devices');
export const FURNITURE_3D_DIR = path.resolve(MODELS_3D_DIR, 'furniture');

// Root fallback uploads directory (retained non-destructively for backward compatibility)
export const ROOT_UPLOADS_DIR = path.resolve(PROJECT_ROOT, 'uploads');
export const ROOT_FLOOR_PLANS_DIR = path.resolve(ROOT_UPLOADS_DIR, 'floor-plans');

/**
 * Ensure all storage directories exist synchronously on module load
 */
export function ensureStorageDirectoriesExist() {
  const dirs = [
    UPLOADS_DIR,
    FLOOR_PLANS_DIR,
    HOUSE_MODELS_DIR,
    THUMBNAILS_DIR,
    SURVEYS_DIR,
    MODELS_3D_DIR,
    DEVICES_3D_DIR,
    FURNITURE_3D_DIR,
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  if (ROOT_UPLOADS_DIR !== UPLOADS_DIR) {
    [ROOT_UPLOADS_DIR, ROOT_FLOOR_PLANS_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
}

// Call on module load
ensureStorageDirectoriesExist();

/**
 * Checks whether a given target path is strictly contained within allowed root directories
 * to prevent directory/path traversal vulnerabilities.
 */
export function isPathContained(targetPath: string, allowedRoots: string[]): boolean {
  const normalizedTarget = path.resolve(targetPath);
  return allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    const rel = path.relative(normalizedRoot, normalizedTarget);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}

/**
 * Sanitizes and validates an arbitrary input filename or storage key to prevent
 * directory traversal, encoded traversal, and null-byte injection.
 */
export function sanitizeStorageFilename(rawFilename: string | null | undefined): string | null {
  if (!rawFilename || typeof rawFilename !== 'string') return null;

  // Check for null bytes
  if (rawFilename.includes('\0') || rawFilename.includes('%00')) {
    console.warn(`[Security Guard] Null byte injection detected in filename: '${rawFilename}'`);
    return null;
  }

  // Attempt URL decoding to detect encoded traversals like %2e%2e
  let decoded = rawFilename;
  try {
    decoded = decodeURIComponent(rawFilename);
  } catch {
    // Malformed URI encoding
    return null;
  }

  // Reject paths containing parent traversal sequences or directory separators
  if (
    decoded.includes('..') ||
    decoded.includes('/') ||
    decoded.includes('\\') ||
    rawFilename.includes('..') ||
    rawFilename.includes('/') ||
    rawFilename.includes('\\')
  ) {
    console.warn(`[Security Guard] Directory traversal attempt in filename: '${rawFilename}'`);
    return null;
  }

  const base = path.basename(decoded).trim();
  return base.length > 0 ? base : null;
}

/**
 * Resolves and ensures the property-specific directory for internal survey photos:
 * backend/uploads/surveys/{houseId}/
 * Strict validation ensures houseId cannot contain traversal characters.
 */
export function getHouseSurveyDirectory(houseId: string): string {
  const safeHouseId = sanitizeStorageFilename(houseId) || path.basename(houseId).trim();
  const houseSurveyDir = path.resolve(SURVEYS_DIR, safeHouseId);
  if (!fs.existsSync(houseSurveyDir)) {
    fs.mkdirSync(houseSurveyDir, { recursive: true });
  }
  return houseSurveyDir;
}

/**
 * Resolves a property-specific survey photo path, verifying strict containment
 * within backend/uploads/surveys/{houseId}/.
 * Returns the resolved absolutePath and safeFilename, or null if traversal or invalid.
 */
export function resolveHouseSurveyPhotoPath(
  houseId: string,
  rawFilename: string
): { absolutePath: string; safeFilename: string } | null {
  const safeFilename = sanitizeStorageFilename(rawFilename);
  if (!safeFilename) return null;

  const safeHouseId = sanitizeStorageFilename(houseId);
  if (!safeHouseId) return null;

  const houseSurveyDir = path.resolve(SURVEYS_DIR, safeHouseId);
  const targetPath = path.resolve(houseSurveyDir, safeFilename);

  // Strict directory containment check against both houseSurveyDir and SURVEYS_DIR
  if (!isPathContained(targetPath, [houseSurveyDir]) || !isPathContained(targetPath, [SURVEYS_DIR])) {
    console.warn(`[Security Guard] Directory containment breach attempt: '${targetPath}' not in '${houseSurveyDir}'`);
    return null;
  }

  return { absolutePath: targetPath, safeFilename };
}

/**
 * Resolves and ensures the property-specific directory for floor plans (Phase 10):
 * backend/uploads/floor-plans/{houseId}/
 * Strict validation ensures houseId cannot contain traversal characters.
 */
export function getHouseFloorPlanDirectory(houseId: string): string {
  const safeHouseId = sanitizeStorageFilename(houseId) || path.basename(houseId).trim();
  const houseFloorPlanDir = path.resolve(FLOOR_PLANS_DIR, safeHouseId);
  if (!fs.existsSync(houseFloorPlanDir)) {
    fs.mkdirSync(houseFloorPlanDir, { recursive: true });
  }
  return houseFloorPlanDir;
}

/**
 * Resolves a property-specific floor plan image path, verifying strict containment
 * within backend/uploads/floor-plans/{houseId}/ or FLOOR_PLANS_DIR (Phase 10).
 * Returns the resolved absolutePath and safeFilename, or null if traversal or invalid.
 */
export function resolveHouseFloorPlanPath(
  houseId: string,
  rawFilename: string
): { absolutePath: string; safeFilename: string } | null {
  const safeFilename = sanitizeStorageFilename(rawFilename);
  if (!safeFilename) return null;

  const safeHouseId = sanitizeStorageFilename(houseId);
  if (!safeHouseId) return null;

  const houseFloorPlanDir = path.resolve(FLOOR_PLANS_DIR, safeHouseId);
  const targetPath = path.resolve(houseFloorPlanDir, safeFilename);

  // Strict directory containment check against houseFloorPlanDir and FLOOR_PLANS_DIR
  if (!isPathContained(targetPath, [houseFloorPlanDir]) || !isPathContained(targetPath, [FLOOR_PLANS_DIR])) {
    console.warn(`[Security Guard] Directory containment breach attempt: '${targetPath}' not in '${houseFloorPlanDir}'`);
    return null;
  }

  return { absolutePath: targetPath, safeFilename };
}

/**
 * Resolves and ensures the order-specific directory for internal survey photos (Phase 9):
 * backend/uploads/surveys/orders/{orderId}/
 * Strict validation ensures orderId cannot contain traversal characters.
 */
export function getOrderSurveyDirectory(orderId: string): string {
  const safeOrderId = sanitizeStorageFilename(orderId) || path.basename(orderId).trim();
  const orderSurveyDir = path.resolve(SURVEYS_DIR, 'orders', safeOrderId);
  if (!fs.existsSync(orderSurveyDir)) {
    fs.mkdirSync(orderSurveyDir, { recursive: true });
  }
  return orderSurveyDir;
}

/**
 * Resolves an order-specific survey photo path, verifying strict containment
 * within backend/uploads/surveys/orders/{orderId}/.
 * Returns the resolved absolutePath and safeFilename, or null if traversal or invalid.
 */
export function resolveOrderSurveyPhotoPath(
  orderId: string,
  rawFilename: string
): { absolutePath: string; safeFilename: string } | null {
  const safeFilename = sanitizeStorageFilename(rawFilename);
  if (!safeFilename) return null;

  const safeOrderId = sanitizeStorageFilename(orderId);
  if (!safeOrderId) return null;

  const orderSurveyDir = path.resolve(SURVEYS_DIR, 'orders', safeOrderId);
  const targetPath = path.resolve(orderSurveyDir, safeFilename);

  if (!isPathContained(targetPath, [orderSurveyDir]) || !isPathContained(targetPath, [SURVEYS_DIR])) {
    console.warn(`[Security Guard] Directory containment breach attempt: '${targetPath}' not in '${orderSurveyDir}'`);
    return null;
  }

  return { absolutePath: targetPath, safeFilename };
}

/**
 * Robustly resolves any relative or absolute upload path across cwd differences
 * with strict directory containment validation to defeat path traversal attacks.
 */
export function resolveUploadPath(storedPath: string | null | undefined): string | null {
  if (!storedPath || typeof storedPath !== 'string') return null;

  // Reject null-byte injections
  if (storedPath.includes('\0') || storedPath.includes('%00')) {
    console.warn(`[Security Guard] Null-byte injection attempt blocked: '${storedPath}'`);
    return null;
  }

  // Attempt URL decoding
  let decoded = storedPath;
  try {
    decoded = decodeURIComponent(storedPath);
  } catch {
    return null;
  }

  // Reject paths containing explicit parent traversal sequences
  if (storedPath.includes('..') || decoded.includes('..')) {
    console.warn(`[Security Guard] Path traversal attempt blocked: '${storedPath}'`);
    return null;
  }

  const allowedRoots = [
    UPLOADS_DIR,
    ROOT_UPLOADS_DIR,
    FLOOR_PLANS_DIR,
    ROOT_FLOOR_PLANS_DIR,
    HOUSE_MODELS_DIR,
    THUMBNAILS_DIR,
    SURVEYS_DIR,
    path.resolve(PROJECT_ROOT, 'assets'),
    path.resolve(BACKEND_ROOT, 'assets'),
  ];

  // If already absolute, verify containment before returning
  if (path.isAbsolute(storedPath)) {
    if (fs.existsSync(storedPath) && isPathContained(storedPath, allowedRoots)) {
      return storedPath;
    }
    return null;
  }

  const cleanPath = storedPath.replace(/^[/\\]+/, '');
  const baseName = path.basename(cleanPath);

  const candidates = [
    path.resolve(FLOOR_PLANS_DIR, baseName),
    path.resolve(SURVEYS_DIR, baseName),
    path.resolve(HOUSE_MODELS_DIR, baseName),
    path.resolve(THUMBNAILS_DIR, baseName),
    path.resolve(ROOT_FLOOR_PLANS_DIR, baseName),
    path.resolve(BACKEND_ROOT, cleanPath),
    path.resolve(PROJECT_ROOT, cleanPath),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && isPathContained(candidate, allowedRoots)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Synchronize a file to both backend and root uploads directories
 * to ensure persistent access regardless of server working directory
 */
export function syncFileToAllUploadDirs(fileName: string, sourcePath: string) {
  try {
    const targets = [
      path.resolve(FLOOR_PLANS_DIR, fileName),
      path.resolve(ROOT_FLOOR_PLANS_DIR, fileName),
    ];

    for (const target of targets) {
      if (target !== sourcePath && fs.existsSync(sourcePath)) {
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        if (!fs.existsSync(target)) {
          fs.copyFileSync(sourcePath, target);
        }
      }
    }
  } catch (err) {
    console.warn('Non-critical: Failed to sync upload file across dirs:', err);
  }
}

export interface SecureStreamOptions {
  filePath: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  maxAgeSeconds?: number;
  allowByteRange?: boolean;
}

/**
 * Standardized secure file streaming handler supporting HTTP 206 Partial Content (Byte-Range Requests),
 * defensive headers, and sanitized error handling without leaking filesystem paths.
 */
export function streamFileSecurely(
  req: Request,
  res: Response,
  options: SecureStreamOptions
): void {
  const {
    filePath,
    mimeType,
    fileName = path.basename(filePath),
    maxAgeSeconds = 3600,
    allowByteRange = true,
  } = options;

  let totalSize = options.fileSize;
  if (totalSize === undefined) {
    try {
      const stat = fs.statSync(filePath);
      totalSize = stat.size;
    } catch {
      res.status(404).json({ success: false, message: 'Berkas tidak ditemukan pada penyimpanan.' });
      return;
    }
  }

  // Sanitized filename for Content-Disposition header
  const safeFilename = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Defensive security headers
  res.setHeader('Content-Type', mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  res.setHeader('Cache-Control', `private, no-transform, max-age=${maxAgeSeconds}`);
  res.setHeader('Accept-Ranges', 'bytes');

  // Handle Byte-Range Request if requested and enabled
  const rangeHeader = req.headers.range;
  if (allowByteRange && rangeHeader && totalSize > 0) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
      return;
    }

    const rawStart = match[1];
    const rawEnd = match[2];

    let start = rawStart ? parseInt(rawStart, 10) : 0;
    let end = rawEnd ? parseInt(rawEnd, 10) : totalSize - 1;

    // Suffix range request (e.g. bytes=-500)
    if (!rawStart && rawEnd) {
      start = totalSize - parseInt(rawEnd, 10);
      end = totalSize - 1;
    }

    // Validate boundaries
    if (isNaN(start) || isNaN(end) || start < 0 || end >= totalSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${totalSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    res.setHeader('Content-Length', chunkSize);

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', (err) => {
      console.error('[streamFileSecurely] Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Gagal membaca aliran berkas.' });
      }
    });
    stream.pipe(res);
    return;
  }

  // Full file streaming
  res.status(200);
  res.setHeader('Content-Length', totalSize);

  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error('[streamFileSecurely] Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Gagal membaca aliran berkas.' });
    }
  });
  stream.pipe(res);
}
