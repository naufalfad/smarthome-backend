import { Request, Response, NextFunction } from 'express';

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();
  const { method } = req;
  // Redact any sensitive query parameters (e.g. token/password) from request logs
  const safeUrl = req.originalUrl.replace(
    /([?&](?:token|access_token|authorization|password|secret)=)[^&]*/gi,
    '$1[REDACTED]'
  );

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const timestamp = new Date().toISOString();
    
    // Colored or structured console output
    const statusColor =
      statusCode >= 500
        ? '\x1b[31m' // Red
        : statusCode >= 400
        ? '\x1b[33m' // Yellow
        : statusCode >= 300
        ? '\x1b[36m' // Cyan
        : '\x1b[32m'; // Green
    const resetColor = '\x1b[0m';

    console.log(
      `[${timestamp}] ${method} ${safeUrl} ${statusColor}${statusCode}${resetColor} - ${duration}ms`
    );
  });

  next();
};

