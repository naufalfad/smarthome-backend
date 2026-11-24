import { Request, Response, NextFunction } from 'express';

/**
 * PHASE 9: HTTP SECURITY HEADERS MIDDLEWARE
 * Enforces production-grade defensive HTTP headers without breaking SPA or static asset streaming.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // 2. Clickjacking protection (allow same origin for preview / embedding if needed)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // 3. Cross-site scripting legacy filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 4. Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 5. Cross-Origin Resource Policy: allow loading images/GLB from same origin or designated frontend
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // 6. Strict Transport Security (HSTS) if running on HTTPS
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // 7. Base Content-Security-Policy (Allows SPA API and blob/data asset rendering)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; object-src 'none'; frame-ancestors 'self';"
  );

  next();
}

