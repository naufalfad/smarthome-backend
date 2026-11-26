import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.deviceCatalogItem.findMany();
  console.log('TOTAL DEVICE CATALOG ITEMS IN DB:', items.length);
  for (const it of items) {
    console.log(`- [${it.category}] ${it.deviceType}: ${it.name} (icon: ${it.icon}, color: ${it.color})`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
