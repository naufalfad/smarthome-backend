import express from 'express';
import cors from 'cors';
import path from 'path';
import { disconnectDatabase } from './services/db.service.js';
import { config } from './config/env.js';
import { UPLOADS_DIR, ROOT_UPLOADS_DIR } from './utils/storage-path.util.js';
import { requestLogger } from './middlewares/logger.middleware.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';
import { securityHeadersMiddleware } from './middlewares/security-headers.middleware.js';
import { generalApiLimiter } from './middlewares/rate-limiter.middleware.js';
import { sanitizeRequestBody } from './middlewares/validation.middleware.js';
import apiRouter from './routes/index.js';
import { SimulationEngine } from './simulation/simulation.engine.js';
import { DeviceProviderRegistry } from './providers/device-provider.registry.js';
import { AutomationEngine } from './automation/automation.engine.js';
import { DeviceManagementService } from './services/device-management.service.js';
import { seedUsers } from './scripts/seed-users.js';

export const app = express();

// 1. Disable information disclosure header
app.disable('x-powered-by');

// 2. HTTP Security Defensive Headers
app.use(securityHeadersMiddleware);

// 3. CORS Configuration
app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// 4. Request Body Parsing with Strict Size Limit (prevents memory DoS)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// 5. Input Sanitization (strips null bytes)
app.use(sanitizeRequestBody);

// 6. Explicitly disable public static access to /uploads (Phase 5 Canonical Storage Architecture)
// Private tenant media must be streamed via authenticated, state-aware endpoints with JWT verification.
app.use('/uploads', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Akses publik dinonaktifkan: Berkas media hanya dapat diakses melalui endpoint streaming terotentikasi.',
  });
});
app.use('/assets', express.static(path.resolve('assets'), { dotfiles: 'ignore', index: false }));

// 7. Request Logger
app.use(requestLogger);

// 8. Root route
app.get('/', (_req, res) => {
  res.json({
    name: '3D Smart Home Monitoring Platform API',
    version: '1.0.0',
    documentation: '/api/health',
    status: 'online',
  });
});

// 9. Mount Central API Routes with Rate Limiting under /api
app.use('/api', generalApiLimiter, apiRouter);

// 10. 404 Not Found Handler
app.use(notFoundHandler);

// 11. Centralized Error Handling Middleware
app.use(errorHandler);

// Start server and initialize resilient worker background lifecycles
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(config.port, async () => {
    console.log('====================================================');
    console.log(`🚀 Smart Home 3D Backend API`);
    console.log(`📡 Server listening on: http://localhost:${config.port}`);
    console.log(`🩺 Health check:        http://localhost:${config.port}/api/health`);
    console.log(`⚙️  Environment:         ${config.nodeEnv}`);
    console.log('====================================================');

    // Ensure default Admin and Resident user accounts exist
    try {
      await seedUsers();
    } catch (userSeedErr) {
      console.warn('⚠️ [Auth] User seeding notice:', userSeedErr);
    }

    // Recover dangling commands from prior server crashes or interruptions
    try {
      const recoveredCommands = await DeviceManagementService.recoverDanglingCommands();
      if (recoveredCommands > 0) {
        console.log(`🔧 [DeviceManagementService] Recovered ${recoveredCommands} dangling command(s).`);
      }
    } catch (cmdRecErr) {
      console.warn('⚠️ [DeviceManagementService] Command recovery warning:', cmdRecErr);
    }

    // Start Phase 6 Device Provider Layer & Virtual Device Provider
    try {
      const registry = DeviceProviderRegistry.getInstance();
      await registry.initializeAll();
      registry.startAll();
      console.log('⚡ Device Provider Layer & Virtual Device Provider started successfully');
    } catch (providerErr) {
      console.error('❌ Failed to start Device Provider Registry:', providerErr);
    }

    // Start Phase 7 Smart Home Automation Engine
    try {
      const automationEngine = AutomationEngine.getInstance();
      await automationEngine.start();
      console.log('⚡ Smart Home Automation Engine started successfully');
    } catch (autoErr) {
      console.error('❌ Failed to start Automation Engine:', autoErr);
    }
  });

  // Graceful Shutdown Handler (idempotent)
  let isShuttingDown = false;
  const handleGracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    try {
      // 1. Stop background workers
      const simEngine = SimulationEngine.getInstance();
      simEngine.stop();

      const autoEngine = AutomationEngine.getInstance();
      autoEngine.stop();

      // 2. Close HTTP Server and wait for active connections to drain
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log('🔌 HTTP Server closed.');
          resolve();
        });
      });

      // 3. Disconnect shared Prisma singleton connection pool
      await disconnectDatabase();
      console.log('💾 Shared database connection pool closed gracefully.');

      process.exit(0);
    } catch (err) {
      console.error('❌ Error during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => handleGracefulShutdown('SIGINT'));
  process.once('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
}

export default app;

