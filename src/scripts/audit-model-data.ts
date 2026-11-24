import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function auditData() {
  const models = await prisma.houseModel.findMany();
  console.log(`=== Total HouseModels in DB: ${models.length} ===`);
  for (const m of models) {
    const idCount = await prisma.nodeIdentification.count({ where: { houseModelId: m.id } });
    console.log(`- Model: "${m.name}" (ID: ${m.id}) | File: ${m.fileName} | Identifications count: ${idCount}`);
  }

  const targetId = '51a065ca-85e1-4c35-88c7-be5b684c6250';
  const targetModel = await prisma.houseModel.findUnique({ where: { id: targetId } });

  if (!targetModel) {
    console.log(`\nModel with ID ${targetId} NOT FOUND.`);
    return;
  }

  console.log(`\n=== Detailed Audit for Target Model "${targetModel.name}" (${targetId}) ===`);
  const idents = await prisma.nodeIdentification.findMany({
    where: { houseModelId: targetId },
    orderBy: { nodeName: 'asc' },
  });

  console.log(`Total identifications: ${idents.length}`);
  idents.forEach((i) => {
    console.log(
      `[${i.nodeType}] ${i.nodeName} -> displayName: "${i.displayName}", category: "${i.category}", suggested: "${i.suggestedCategory}", status: ${i.status}, parentRoom: "${i.parentRoom}", parentFloor: "${i.parentFloor}", desc: "${i.description || ''}"`
    );
  });
}

auditData().finally(() => prisma.$disconnect());

