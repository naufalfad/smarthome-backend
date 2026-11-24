import { prisma } from '../services/db.service.js';

async function main() {
  const pkgs = await prisma.servicePackage.findMany({
    orderBy: { displayOrder: 'asc' },
    include: { inclusions: { orderBy: { displayOrder: 'asc' } } }
  });
  console.log('Total packages in DB:', pkgs.length);
  for (const p of pkgs) {
    console.log(JSON.stringify({
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      price: p.price.toString(),
      shortDescription: p.shortDescription,
      hasPhysicalIot: p.hasPhysicalIot,
      hasThreeD: p.hasThreeD,
      maxRooms: p.maxRooms,
      maxDevices: p.maxDevices,
      includedAutomations: p.includedAutomations,
      inclusionsCount: p.inclusions.length,
      inclusions: p.inclusions.map(i => ({ name: i.displayName, included: i.isIncluded, category: i.category, qty: i.quantity }))
    }, null, 2));
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});
