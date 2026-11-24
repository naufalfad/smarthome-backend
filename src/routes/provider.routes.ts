import { Router } from 'express';
import {
  getProviderStatuses,
  getProviderHealth,
} from '../controllers/provider.controller.js';
import { requireRole } from '../middlewares/auth.middleware.js';

const providerRoutes = Router();

// Hardware provider layer - Super Admin only
providerRoutes.use(requireRole('SUPER_ADMIN'));

providerRoutes.get('/status', getProviderStatuses);
providerRoutes.get('/health', getProviderHealth);

export default providerRoutes;

