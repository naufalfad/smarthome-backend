import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const house = await prisma.house.findUnique({
    where: { id: '723b3e66-13ea-4089-8f1e-4f89ed439d3a' },
    include: {
      serviceOrders: {
        include: {
          servicePackage: true,
        },
      },
      floors: {
        include: {
          floorPlan: true,
          rooms: true,
        },
      },
    },
  });

  console.log('HOUSE:', house?.name, 'status:', house?.setupStatus);
  console.log('Orders:');
  for (const o of house?.serviceOrders || []) {
    console.log(`- Order ${o.orderNumber}: Package=${o.servicePackage?.name} (maxDevices=${o.servicePackage?.maxDevices})`);
    console.log(`  Snapshot:`, JSON.stringify(o.packageSnapshot));
  }

  console.log('Floors & Rooms:');
  for (const f of house?.floors || []) {
    console.log(`Floor ${f.name} (id: ${f.id}):`);
    for (const r of f.rooms) {
      console.log(`  - Room: ${r.name} (${r.type}, id: ${r.id}) area: ${r.areaSquareMeters}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
