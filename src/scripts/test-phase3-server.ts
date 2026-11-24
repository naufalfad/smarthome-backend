process.env.NODE_ENV = 'test';
import { app } from '../server.js';
import http from 'http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testServer() {
  const PORT = 5098;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Test server active on port ${PORT}`);
      resolve();
    });
  });

  try {
    const models = await prisma.houseModel.findMany();
    if (models.length === 0) {
      console.error('No models found in database!');
      process.exit(1);
    }
    const model = models[0];

    // Test GET /api/house-models/:id
    const metaRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}`);
    const metaJson: any = await metaRes.json();
    console.log(`[TEST] GET /api/house-models/${model.id} -> Status:`, metaRes.status, 'Success:', metaJson.success);
    if (!metaJson.success || !metaJson.data) {
      throw new Error('Failed to retrieve model details from API');
    }

    // Test GET /api/house-models/:id/file
    const fileRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/file`);
    console.log(`[TEST] GET /api/house-models/${model.id}/file -> Status:`, fileRes.status, 'ContentType:', fileRes.headers.get('content-type'));
    const arrayBuffer = await fileRes.arrayBuffer();
    console.log(`[TEST] Streamed bytes: ${arrayBuffer.byteLength} bytes`);

    if (fileRes.status !== 200 || arrayBuffer.byteLength === 0) {
      throw new Error('GLB file streaming failed or returned 0 bytes');
    }

    console.log('\n🎉 ALL PHASE 3 BACKEND API & STREAMING CHECKS PASSED!\n');
    process.exit(0);
  } catch (err: any) {
    console.error('Test server error:', err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

testServer();
