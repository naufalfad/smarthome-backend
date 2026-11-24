import dotenv from 'dotenv';
import path from 'path';
import { HOUSE_MODELS_DIR, THUMBNAILS_DIR, UPLOADS_DIR } from '../utils/storage-path.util.js';

// Load environment variables from .env file
dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string | string[];
  databaseUrl: string;
  isProduction: boolean;
  jwtSecret: string;
  jwtExpiryMs: number;
  uploadDir: string;
  maxModelSizeMb: number;
  maxFileSizeBytes: number;
  modelsStorageDir: string;
  thumbnailsStorageDir: string;
}

const parseCorsOrigin = (originStr?: string): string | string[] => {
  if (!originStr) return '*';
  if (originStr.includes(',')) {
    return originStr.split(',').map((o) => o.trim());
  }
  return originStr;
};

const isProduction = process.env.NODE_ENV === 'production';

const resolveJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 16) {
    return secret;
  }
  if (isProduction) {
    throw new Error(
      'CRITICAL SECURITY ERROR: JWT_SECRET environment variable must be configured (>= 16 chars) in production.'
    );
  }
  // Development/test-only fallback preserving existing local session compatibility
  return secret || 'smarthome-jwt-secret-key-phase9-2026-production-ready';
};

const uploadDirRel = process.env.UPLOAD_DIR || 'uploads';
const maxModelSizeMb = parseInt(process.env.MAX_MODEL_SIZE_MB || '100', 10);
const jwtExpiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24', 10);

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  databaseUrl: process.env.DATABASE_URL || '',
  isProduction,
  jwtSecret: resolveJwtSecret(),
  jwtExpiryMs: (isNaN(jwtExpiryHours) || jwtExpiryHours <= 0 ? 24 : jwtExpiryHours) * 60 * 60 * 1000,
  uploadDir: uploadDirRel,
  maxModelSizeMb,
  maxFileSizeBytes: maxModelSizeMb * 1024 * 1024,
  modelsStorageDir: HOUSE_MODELS_DIR,
  thumbnailsStorageDir: THUMBNAILS_DIR,
};
