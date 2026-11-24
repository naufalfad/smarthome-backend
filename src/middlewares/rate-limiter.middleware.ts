import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 minute)
  maxRequests?: number; // Max allowed requests per window (default: 600)
  message?: string;
  skipInTest?: boolean;
}

/**
 * PHASE 9: IN-MEMORY SLIDING-WINDOW RATE LIMITER
 * Lightweight, zero-external-dependency rate limiter protecting against DoS and command flood.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const maxRequests = options.maxRequests || 600;
  const message =
    options.message ||
    'Terlalu banyak permintaan dari alamat IP Anda. Silakan coba beberapa saat lagi.';
  const skipInTest = options.skipInTest !== false;

  const storage = new Map<string, RateLimitRecord>();

  // Periodically clean up expired entries every 2 minutes to prevent memory leak
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of storage.entries()) {
      if (now > record.resetTime) {
        storage.delete(key);
      }
    }
  }, 2 * 60 * 1000);

  // Allow Node process to exit gracefully without timer keeping event loop alive
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip rate limiting during test executions if enabled
    if (skipInTest && process.env.NODE_ENV === 'test') {
      return next();
    }

    // Resolve client IP address (supporting reverse proxies)
    const clientIp =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown-ip';

    const now = Date.now();
    let record = storage.get(clientIp);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      storage.set(clientIp, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', maxRequests.toString());
    res.setHeader('RateLimit-Remaining', remaining.toString());
    res.setHeader('RateLimit-Reset', resetSeconds.toString());

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds.toString());
      res.status(429).json({
        success: false,
        message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 600,
});

export const commandAndUploadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 120,
  message: 'Batas pengiriman perintah atau berkas terlampaui. Silakan tunggu 1 menit.',
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 40,
  message: 'Terlalu banyak percobaan autentikasi atau pendaftaran. Silakan tunggu beberapa menit.',
});
