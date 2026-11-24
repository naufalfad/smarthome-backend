import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: unknown;
  timestamp: string;
}

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200
): Response => {
  const payload: ApiResponse<T> = {
    success: true,
    message,
    ...(data !== undefined && { data }),
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(payload);
};

export const sendError = (
  res: Response,
  message: string,
  error?: unknown,
  statusCode = 500
): Response => {
  const payload: ApiResponse = {
    success: false,
    message,
    ...(error !== undefined && {
      error: error instanceof Error ? error.message : error,
    }),
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(payload);
};

