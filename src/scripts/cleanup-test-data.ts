import { PrismaClient, IdentificationStatus } from '@prisma/client';
import { generateSuggestion } from '../services/identification-engine.service.js';

const prisma = new PrismaClient();

async function selectiveCleanupAda() {
  const modelId = '51a065ca-85e1-4c35-88c7-be5b684c6250';
  const model = await prisma.houseModel.findUnique({ where: { id: modelId } });

  if (!model) {
    console.error('Model Ada not found!');
    return;
  }

  console.log('=== Selective Cleanup for Model "Ada" ===\n');

  // List of nodes altered during test-phase4.ts
  const nodesToRestore = [
    'ROOM_BATHROOM',
    'OBJ_AC_BEDROOM_01',
    'ANCHOR_AIR_QUALITY_LIVING_01',
    'OBJ_AC_LIVING_01',
    'OBJ_LIGHT_BATHROOM_01',
  ];

  for (const nodeName of nodesToRestore) {
    const existing = await prisma.nodeIdentification.findUnique({
      where: { houseModelId_nodeName: { houseModelId: modelId, nodeName } },
    });

    if (existing) {
      console.log(`[BEFORE] ${nodeName}:`);
      console.log(`  displayName: "${existing.displayName}"`);
      console.log(`  category: "${existing.category}"`);
      console.log(`  status: "${existing.status}"`);
      console.log(`  description: "${existing.description}"`);

      const suggestion = generateSuggestion(nodeName);

      const restored = await prisma.nodeIdentification.update({
        where: { id: existing.id },
        data: {
          displayName: suggestion.suggestedDisplayName,
          category: suggestion.suggestedCategory,
          status: IdentificationStatus.SUGGESTED,
          description: null,
          revalidationStatus: 'MATCHED',
        },
      });

      console.log(`[AFTER] ${nodeName}:`);
      console.log(`  displayName: "${restored.displayName}"`);
      console.log(`  category: "${restored.category}"`);
      console.log(`  status: "${restored.status}"`);
      console.log(`  description: "${restored.description}"\n`);
    }
  }

  console.log('✅ Selective cleanup of test artifacts completed successfully.');
}

selectiveCleanupAda().finally(() => prisma.$disconnect());

