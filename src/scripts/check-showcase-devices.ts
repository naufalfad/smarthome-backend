import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const houseId = '723b3e66-13ea-4089-8f1e-4f89ed439d3a';
  const devs = await prisma.device.findMany({
    where: { houseId },
    include: { catalogItem: true, room: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`=== SHOWCASE HOUSE: TOTAL DEVICES = ${devs.length} ===`);
  const catCounts: Record<string, number> = {};

  for (const d of devs) {
    const cat = d.catalogItem?.category || 'UNKNOWN';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    console.log(
      `[${cat.padEnd(11)}] ${d.name.padEnd(35)} | Room: ${(d.room?.name || 'T/A').padEnd(25)} | Pos: (${Math.round(d.x)}, ${Math.round(d.y)}) | Status: ${d.status}`
    );
  }

  console.log('\n--- KATEGORI SUMMARY ---');
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log(`- ${cat}: ${count} devices`);
  }

  console.log('\n--- SAMPLE VISUAL CAMERA CONFIGURATION FROM DB ---');
  const cam = devs.find((d) => d.type === 'OUTDOOR_CAMERA');
  if (cam) {
    console.log(`Device: ${cam.name} (id: ${cam.id})`);
    console.log(JSON.stringify(cam.configuration, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
