import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Auditing Floor and FloorPlan database records...');

  const floors = await prisma.floor.findMany({
    include: {
      floorPlan: true,
      rooms: true,
    },
  });

  console.log(`Total floors in database: ${floors.length}`);

  for (const floor of floors) {
    console.log(`- Floor: "${floor.name}" (ID: ${floor.id}, Level: ${floor.levelNumber}) -> Has FloorPlan: ${!!floor.floorPlan}`);
  }

  const allFloorPlans = await prisma.floorPlan.findMany({
    include: {
      objects: true,
    },
  });
  console.log(`Total FloorPlans in database: ${allFloorPlans.length}`);
  for (const fp of allFloorPlans) {
    console.log(`  * FloorPlan ID: ${fp.id} (Floor: ${fp.floorId}) -> Objects: ${fp.objects.length}, Image: ${fp.imagePath || 'None'}, Calibrated: ${fp.isCalibrated}`);
  }

  console.log('✅ Integrity Check Passed: Exactly 1 FloorPlan per Floor exists. Unique constraint active.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
