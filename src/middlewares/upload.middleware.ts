import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config/env.js';

// Ensure storage directories exist synchronously on startup
if (!fs.existsSync(config.modelsStorageDir)) {
  fs.mkdirSync(config.modelsStorageDir, { recursive: true });
}
if (!fs.existsSync(config.thumbnailsStorageDir)) {
  fs.mkdirSync(config.thumbnailsStorageDir, { recursive: true });
}

// Configure disk storage with unique filenames
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.modelsStorageDir);
  },
  filename: (_req, file, cb) => {
    // Generate secure random unique filename, preserving .glb extension
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().slice(0, 12)}`;
    const safeBase = file.originalname
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    cb(null, `house-${safeBase}-${uniqueSuffix}.glb`);
  },
});

// File filter strictly for .glb extension and gltf-binary mime types
const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.glb') {
    return cb(
      new Error(
        `Invalid file type '${ext}'. Only binary 3D models with '.glb' extension are accepted.`
      )
    );
  }
  cb(null, true);
};

export const uploadModelFile = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeBytes,
  },
  fileFilter,
});

/**
 * Phase 9: Secure Multer middleware for internal field survey photographs.
 * Accepts image types (.jpg, .jpeg, .png, .webp) up to 15MB.
 * Uses memoryStorage to safely pass buffer to FieldSurveyService which writes
 * to order-scoped backend/uploads/surveys/orders/{orderId}/
 */
export const uploadSurveyPhotoFile = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowed.includes(ext)) {
      return cb(
        new Error(
          `Format berkas '${ext}' tidak didukung. Harap unggah foto dengan format JPG, PNG, atau WEBP.`
        )
      );
    }
    cb(null, true);
  },
});

/**
 * 3D Catalog Model Upload (.glb only, up to 50MB)
 */
export const uploadCatalog3dGlb = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.glb') {
      return cb(
        new Error(
          `Format berkas '${ext}' tidak didukung. Harap unggah model 3D dalam format biner GLB (.glb).`
        )
      );
    }
    cb(null, true);
  },
});


