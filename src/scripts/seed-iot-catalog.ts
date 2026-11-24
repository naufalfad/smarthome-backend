import { PrismaClient } from '@prisma/client';
import { IOT_DEVICE_CATALOG } from '../constants/device-capabilities.js';

const prisma = new PrismaClient();

export async function seedIoTDeviceCatalog() {
  console.log('====================================================');
  console.log('🌱 SEEDING IOT DEVICE CATALOG (PHASE 4)');
  console.log('====================================================\n');

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of IOT_DEVICE_CATALOG) {
    const existing = await prisma.deviceCatalogItem.findUnique({
      where: { deviceType: item.deviceType },
    });

    const result = await prisma.deviceCatalogItem.upsert({
      where: { deviceType: item.deviceType },
      update: {
        name: item.name,
        category: item.category,
        description: item.description,
        icon: item.icon,
        color: item.color,
        defaultWidth: item.defaultWidth,
        defaultHeight: item.defaultHeight,
        capabilities: item.capabilities as any,
        defaultConfiguration: item.defaultConfiguration,
        isActive: true,
      },
      create: {
        deviceType: item.deviceType,
        name: item.name,
        category: item.category,
        description: item.description,
        icon: item.icon,
        color: item.color,
        defaultWidth: item.defaultWidth,
        defaultHeight: item.defaultHeight,
        capabilities: item.capabilities as any,
        defaultConfiguration: item.defaultConfiguration,
        isActive: true,
      },
    });

    if (existing) {
      updatedCount++;
      console.log(`  🔄 Updated: [${result.category}] ${result.name} (${result.deviceType})`);
    } else {
      createdCount++;
      console.log(`  ✨ Created: [${result.category}] ${result.name} (${result.deviceType})`);
    }
  }

  const totalInDb = await prisma.deviceCatalogItem.count();
  console.log('\n====================================================');
  console.log(`📊 SEED SUMMARY: ${createdCount} created, ${updatedCount} updated (Total in DB: ${totalInDb})`);
  console.log('====================================================');

  return { createdCount, updatedCount, totalInDb };
}

// Allow standalone execution
if (process.argv[1]?.includes('seed-iot-catalog')) {
  seedIoTDeviceCatalog()
    .catch((err) => {
      console.error('❌ Failed to seed IoT device catalog:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

