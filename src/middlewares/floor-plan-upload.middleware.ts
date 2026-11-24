import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { FLOOR_PLANS_DIR } from '../utils/storage-path.util.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, FLOOR_PLANS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID().slice(0, 10)}`;
    cb(null, `bg-${uniqueSuffix}${ext}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg'];
  const allowedMimes = ['image/png', 'image/jpeg', 'image/pjpeg', 'image/svg+xml'];

  if (!allowedExtensions.includes(ext) || !allowedMimes.includes(file.mimetype)) {
    return cb(
      new Error(
        `Invalid file type '${ext}'. Only raster or vector image files (.png, .jpg, .jpeg, .svg) are accepted for floor plan backgrounds.`
      )
    );
  }
  cb(null, true);
};

export const uploadFloorPlanBackground = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max limit
  },
  fileFilter,
});

