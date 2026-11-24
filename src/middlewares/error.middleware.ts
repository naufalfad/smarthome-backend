import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.js';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, null, 404);
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err instanceof AppError ? err.statusCode : 500;
  let message = err.message || 'Internal Server Error';

  // 1. Handle JSON syntax parse error from body-parser/express.json()
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    statusCode = 400;
    message = 'Malformed JSON payload in request body.';
  }

  // 2. Handle Multer upload errors cleanly
  else if (err?.name === 'MulterError' || err?.message?.includes('Invalid file type') || err?.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Ukuran file melebihi batas maksimum yang diperbolehkan.';
    }
  }

  // 3. Handle Prisma ORM Known Errors
  else if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = 'Konflik data: Nilai unik sudah terdaftar pada sistem.';
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Data yang diminta tidak ditemukan.';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Operasi ditolak karena entitas memiliki dependensi data relasional.';
        break;
      case 'P2023':
        statusCode = 400;
        message = 'Format parameter identifier atau UUID tidak valid.';
        break;
      default:
        statusCode = 400;
        message = 'Operasi database gagal diproses.';
    }
  }

  // 4. In production: sanitize unexpected 500 errors to prevent leaking database/server internals
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Terjadi kesalahan internal pada server. Silakan hubungi administrator.';
  }

  // Log error safely without dumping headers/tokens/secrets
  const safeErrorLog = {
    name: err?.name || 'Error',
    code: err?.code,
    statusCode,
    message: err?.message || 'Unexpected error',
  };
  console.error('[Error Middleware Caught]:', safeErrorLog);

  if (err?.multiple_properties_detected) {
    res.status(statusCode).json({
      success: false,
      multiple_properties_detected: true,
      message,
      properties: err?.properties,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  sendError(
    res,
    message,
    process.env.NODE_ENV === 'development' && statusCode >= 500 ? err.stack : undefined,
    statusCode
  );
};

