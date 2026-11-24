import { prisma, disconnectDatabase } from '../services/db.service.js';

async function audit() {
  const models = await prisma.houseModel.findMany({
    select: { id: true, name: true, filePath: true, fileName: true, thumbnailPath: true },
  });
  console.log('--- HouseModels in DB ---');
  console.log(JSON.stringify(models, null, 2));

  const plans = await prisma.floorPlan.findMany({
    select: {
      id: true,
      name: true,
      imagePath: true,
      floor: {
        select: {
          id: true,
          houseId: true,
          house: {
            select: {
              name: true,
              setupStatus: true,
              customerId: true,
            },
          },
        },
      },
    },
  });
  console.log('\n--- FloorPlans in DB ---');
  console.log(JSON.stringify(plans, null, 2));

  await disconnectDatabase();
}

audit().catch(console.error);
