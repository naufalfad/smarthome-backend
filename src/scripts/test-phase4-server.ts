process.env.NODE_ENV = 'test';
import { app } from '../server.js';
import http from 'http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPhase4ServerEndpoints() {
  const PORT = 5097;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
      resolve();
    });
  });

  try {
    const models = await prisma.houseModel.findMany();
    const model = models[0];

    // 1. GET /api/house-models/:id/identifications/overview
    const overviewRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/identifications/overview`);
    const overviewJson: any = await overviewRes.json();
    console.log('[API TEST] GET /overview -> Status:', overviewRes.status, 'Total Nodes:', overviewJson.data?.totalNodes);
    if (!overviewJson.success || !overviewJson.data?.totalNodes) {
      throw new Error('Failed to retrieve identification overview');
    }

    // 2. GET /api/house-models/:id/identifications/tree
    const treeRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/identifications/tree`);
    const treeJson: any = await treeRes.json();
    console.log('[API TEST] GET /tree -> Status:', treeRes.status, 'Tree length:', treeJson.data?.length);
    if (!treeJson.success || !Array.isArray(treeJson.data)) {
      throw new Error('Failed to retrieve identification tree');
    }

    // 3. GET /api/house-models/:id/identifications
    const listRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/identifications`);
    const listJson: any = await listRes.json();
    console.log('[API TEST] GET /identifications -> Status:', listRes.status, 'Count:', listJson.data?.length);
    if (!listJson.success || listJson.data?.length === 0) {
      throw new Error('Failed to list identifications');
    }

    // 4. POST /api/house-models/:id/identifications/bulk (Preview)
    const previewRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/identifications/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ previewOnly: true }),
    });
    const previewJson: any = await previewRes.json();
    console.log('[API TEST] POST /bulk (preview) -> Status:', previewRes.status, 'Preview candidates:', previewJson.data?.totalCandidates);
    if (!previewJson.success || !previewJson.data?.preview) {
      throw new Error('Failed to generate bulk preview');
    }

    // 5. POST /api/house-models/:id/identifications/revalidate
    const revalRes = await fetch(`http://localhost:${PORT}/api/house-models/${model.id}/identifications/revalidate`, {
      method: 'POST',
    });
    const revalJson: any = await revalRes.json();
    console.log('[API TEST] POST /revalidate -> Status:', revalRes.status, 'Matched:', revalJson.data?.summary?.totalMatched);
    if (!revalJson.success || revalJson.data?.summary?.totalMatched === undefined) {
      throw new Error('Failed to revalidate GLB');
    }

    console.log('\n🎉 ALL PHASE 4 REST API ENDPOINTS VERIFIED & WORKING PERFECTLY!\n');
  } catch (err: any) {
    console.error('Phase 4 server test error:', err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

testPhase4ServerEndpoints();

