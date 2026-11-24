import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload, AppUserRole } from '../utils/auth-crypto.util.js';
import { prisma } from '../services/db.service.js';
import { sendError } from '../utils/response.js';

// Extend Express Request interface to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const token = trimmed.substring(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Middleware that strictly verifies JWT access token from Authorization header
 * AND validates that the referenced user still exists AND is active in PostgreSQL,
 * loading live role & CustomerProfile / TechnicianProfile IDs.
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    sendError(
      res,
      'Akses ditolak: Token autentikasi tidak ditemukan. Silakan login terlebih dahulu.',
      undefined,
      401
    );
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    sendError(
      res,
      'Sesi telah berakhir atau token tidak valid. Silakan login kembali.',
      undefined,
      401
    );
    return;
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        customerProfile: { select: { id: true } },
        technicianProfile: { select: { id: true } },
      },
    });

    if (!dbUser || !dbUser.isActive) {
      sendError(
        res,
        'Sesi tidak valid atau akun pengguna tidak aktif. Silakan login kembali atau hubungi administrator.',
        undefined,
        401
      );
      return;
    }

    // Populate request identity from live DB record (never rely on stale JWT role claims)
    req.user = {
      userId: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role as AppUserRole,
      customerProfileId: dbUser.customerProfile?.id ?? null,
      technicianProfileId: dbUser.technicianProfile?.id ?? null,
      exp: payload.exp,
    };

    next();
  } catch {
    console.error('[Auth Middleware] Failed to validate user session');
    sendError(
      res,
      'Gagal memverifikasi sesi autentikasi. Silakan coba beberapa saat lagi.',
      undefined,
      500
    );
  }
}

/**
 * Middleware that restricts access to specified commercial roles (3-role RBAC)
 */
export function requireRole(...allowedRoles: AppUserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'Akses ditolak: Autentikasi diperlukan.', undefined, 401);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      sendError(
        res,
        `Akses dilarang: Peran '${req.user.role}' tidak memiliki izin untuk mengakses sumber daya ini.`,
        undefined,
        403
      );
      return;
    }

    next();
  };
}

/**
 * Optional authentication: attaches user if valid token & active user exist, otherwise proceeds as guest
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            isActive: true,
            customerProfile: { select: { id: true } },
            technicianProfile: { select: { id: true } },
          },
        });
        if (dbUser && dbUser.isActive) {
          req.user = {
            userId: dbUser.id,
            username: dbUser.username,
            email: dbUser.email,
            role: dbUser.role as AppUserRole,
            customerProfileId: dbUser.customerProfile?.id ?? null,
            technicianProfileId: dbUser.technicianProfile?.id ?? null,
            exp: payload.exp,
          };
        }
      } catch {
        // Ignore optional auth lookup failures silently
      }
    }
  }

  next();
}
