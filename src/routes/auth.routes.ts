import { Router } from 'express';
import { login, register, getMe, logout } from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';
import { authRateLimiter } from '../middlewares/rate-limiter.middleware.js';

const router = Router();

// Public unified login endpoint (Email for Customer, Username/Email for Staff) with rate limiting
router.post('/login', authRateLimiter, login);

// Public Customer self-registration endpoint (strictly CUSTOMER role) with rate limiting
router.post('/register', authRateLimiter, register);

// Authenticated current session profile
router.get('/me', authenticateToken, getMe);

// Logout endpoint
router.post('/logout', logout);

export default router;
