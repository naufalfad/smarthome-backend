import crypto from 'crypto';
import { config } from '../config/env.js';

export type AppUserRole = 'SUPER_ADMIN' | 'TECHNICIAN' | 'CUSTOMER';

export interface TokenPayload {
  userId: string;
  username?: string | null;
  email?: string | null;
  role: AppUserRole;
  customerProfileId?: string | null;
  technicianProfileId?: string | null;
  houseId?: string | null; // @deprecated compatibility claim only
  exp: number;
}

/**
 * Encodes a string or buffer into base64url format (RFC 7515)
 */
function base64UrlEncode(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Decodes a base64url string back to utf-8 text
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Hashes a plaintext password using native scrypt with a random 16-byte salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored salt:hash string using timing-safe comparison
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);

    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a standard signed JWT token using HMAC-SHA256
 */
export function generateToken(
  payload: Omit<TokenPayload, 'exp'>,
  expiresInMs: number = config.jwtExpiryMs
): string {
  const exp = Date.now() + expiresInMs;
  const fullPayload: TokenPayload = { ...payload, exp };

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = base64UrlEncode(
    crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest()
  );

  return `${header}.${body}.${signature}`;
}

/**
 * Verifies and decodes a signed JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    if (!header || !body || !signature) return null;

    // Verify header algorithm strictly (prevents alg=none downgrade)
    const parsedHeader = JSON.parse(base64UrlDecode(header));
    if (parsedHeader?.alg !== 'HS256' || parsedHeader?.typ !== 'JWT') {
      return null;
    }

    // Verify signature with length guard + timing-safe comparison
    const expectedSignature = base64UrlEncode(
      crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest()
    );

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload: TokenPayload = JSON.parse(base64UrlDecode(body));

    // Validate required claims and expiration
    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      !payload.userId.trim() ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

