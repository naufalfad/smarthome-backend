import { Request, Response, NextFunction } from 'express';

// Standard UUID (v1-v5) regex pattern
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that specified route parameter(s) conform to standard UUID format
 */
export function validateUuidParam(...paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const val = req.params[name];
      if (typeof val === 'string' && val.length > 0 && !UUID_REGEX.test(val)) {
        res.status(400).json({
          success: false,
          message: `Parameter '${name}' harus berupa UUID yang valid (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).`,
        });
        return;
      }
    }
    next();
  };
}

/**
 * Sanitizes request body string fields by stripping null bytes and non-printable control characters
 */
export function sanitizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    const sanitizeValue = (val: any): any => {
      if (typeof val === 'string') {
        // Remove null bytes and dangerous invisible controls
        return val.replace(/\0/g, '').trim();
      }
      if (Array.isArray(val)) {
        return val.map(sanitizeValue);
      }
      if (val !== null && typeof val === 'object') {
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          cleaned[k] = sanitizeValue(v);
        }
        return cleaned;
      }
      return val;
    };

    req.body = sanitizeValue(req.body);
  }
  next();
}
