import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AppError } from '../middlewares/error.middleware.js';

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const body = req.body || {};
    // Accept unified `identifier` while keeping full backward compatibility with `username` or `email`
    const identifier = body.identifier ?? body.email ?? body.username;
    const password = body.password;

    const result = await AuthService.login(identifier, password);
    return sendSuccess(res, 'Login berhasil', result, 200);
  } catch (err: any) {
    if (err instanceof AppError) {
      return sendError(res, err.message, undefined, err.statusCode);
    }
    return sendError(
      res,
      'Gagal memproses autentikasi. Silakan coba beberapa saat lagi.',
      undefined,
      500
    );
  }
};

export const register = async (req: Request, res: Response): Promise<Response> => {
  try {
    const body = req.body || {};
    const result = await AuthService.registerCustomer({
      name: body.name,
      email: body.email,
      password: body.password,
      phone: body.phone,
      role: body.role,
      isActive: body.isActive,
    });

    return sendSuccess(res, 'Registrasi akun Customer berhasil', result, 201);
  } catch (err: any) {
    if (err instanceof AppError) {
      return sendError(res, err.message, undefined, err.statusCode);
    }
    if (err?.code === 'P2002') {
      return sendError(
        res,
        'Alamat email sudah terdaftar. Silakan masuk atau gunakan alamat email lain.',
        undefined,
        409
      );
    }
    return sendError(
      res,
      'Gagal memproses pendaftaran akun. Silakan coba beberapa saat lagi.',
      undefined,
      500
    );
  }
};

export const getMe = async (req: Request, res: Response): Promise<Response> => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 'Tidak terotentikasi', undefined, 401);
    }

    const profile = await AuthService.getProfile(req.user.userId);
    return sendSuccess(res, 'Profil pengguna berhasil diambil', profile, 200);
  } catch (err: any) {
    if (err instanceof AppError) {
      return sendError(res, err.message, undefined, err.statusCode);
    }
    return sendError(res, 'Gagal mengambil profil pengguna.', undefined, 500);
  }
};

export const logout = async (_req: Request, res: Response): Promise<Response> => {
  return sendSuccess(res, 'Logout berhasil', { loggedOut: true }, 200);
};
