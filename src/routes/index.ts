import { Router } from 'express';
import healthRoutes from './health.routes.js';
import houseModelRoutes from './house-model.routes.js';
import houseRoutes from './house.routes.js';
import floorPlanRoutes from './floor-plan.routes.js';
import objectCatalogRoutes from './object-catalog.routes.js';
import { roomRouter, floorRoomsRouter } from './room.routes.js';
import { deviceRouter, floorPlanDevicesRouter } from './device.routes.js';
import deviceCatalogRoutes from './device-catalog.routes.js';
import publishRoutes from './publish.routes.js';
import clientRoutes from './client-portal.routes.js';
import simulationRoutes from './simulation.routes.js';
import providerRoutes from './provider.routes.js';
import automationRoutes from './automation.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import authRoutes from './auth.routes.js';
import { adminServicePackageRouter, customerCatalogRouter } from './service-package.routes.js';
import { serviceOrderRouter } from './service-order.routes.js';
import { technicianRouter } from './technician.routes.js';
import { fieldSurveyRouter } from './field-survey.routes.js';
import { AutomationController } from '../controllers/automation.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';

const apiRouter = Router();

// =====================================================================
// 1. PUBLIC & SELF-GUARDED ENDPOINTS
// =====================================================================
// Auth endpoints: /login & /logout are public; /me requires valid JWT
apiRouter.use('/auth', authRoutes);

// Health endpoints: / and /live are public minimal probes;
// /ready, /workers, /full, /db require valid JWT (Internal/Restricted)
apiRouter.use('/health', healthRoutes);

// =====================================================================
// 2. DENY-BY-DEFAULT AUTHENTICATION GATE (PHASE 1 SECURITY BASELINE)
//    All operational, property, device, telemetry, automation, and 3D
//    endpoints mounted below require a valid Bearer JWT + valid user.
// =====================================================================
apiRouter.use(authenticateToken);

// Mount house model asset management under /api/house-models (Legacy 3D)
apiRouter.use('/house-models', houseModelRoutes);

// Mount 2D Floor Plan routes (Phase 2 & Phase 3)
apiRouter.use('/houses', houseRoutes);
apiRouter.use('/floor-plans', floorPlanRoutes);
apiRouter.use('/object-catalog', objectCatalogRoutes);
apiRouter.use('/rooms', roomRouter);
apiRouter.use('/floors/:floorId/rooms', floorRoomsRouter);

// Mount Smart Home IoT Devices & Publishing (Phase 4)
apiRouter.use('/device-catalog', deviceCatalogRoutes);
apiRouter.use('/devices', deviceRouter);
apiRouter.use('/floor-plans/:floorPlanId/devices', floorPlanDevicesRouter);
apiRouter.use('/publish', publishRoutes);
apiRouter.use('/client', clientRoutes);

// Mount Background IoT Simulation Engine & Telemetry (Phase 5)
apiRouter.use('/simulation', simulationRoutes);

// Mount Hardware Abstraction & Provider Layer (Phase 6)
apiRouter.use('/providers', providerRoutes);

// Mount Smart Home Automation Engine (Phase 7)
apiRouter.use('/automations', automationRoutes);
apiRouter.use('/automation', automationRoutes);
apiRouter.get('/automation-executions', AutomationController.getAllExecutions);

// Mount Commercial Service Package Catalog & Product Foundation (Phase 6)
apiRouter.use('/service-packages', adminServicePackageRouter);
apiRouter.use('/catalog/packages', customerCatalogRouter);

// Mount Commercial Service Order & Customer Submission (Phase 7)
apiRouter.use('/service-orders', serviceOrderRouter);

// Mount Technician Workspace & Assigned Jobs (Phase 8)
apiRouter.use('/technician', technicianRouter);

// Mount Field Survey photo streaming & public access (Phase 9)
apiRouter.use('/surveys', fieldSurveyRouter);

// Mount Smart Home User Dashboard & Experience (Phase 8)
apiRouter.use('/dashboard', dashboardRoutes);

export default apiRouter;
