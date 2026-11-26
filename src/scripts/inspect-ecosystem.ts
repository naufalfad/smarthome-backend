import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      name: true,
      customerProfile: {
        select: {
          id: true,
          fullName: true,
          houses: {
            select: {
              id: true,
              name: true,
              setupStatus: true,
            },
          },
        },
      },
    },
  });
  console.log('--- USERS WITH CUSTOMER PROFILES ---');
  for (const u of users) {
    console.log(`[${u.role}] ${u.name} (${u.email}) - CustomerProfile: ${u.customerProfile?.id || 'none'}`);
    if (u.customerProfile?.houses?.length) {
      for (const h of u.customerProfile.houses) {
        console.log(`   -> House: ${h.name} (${h.id}) [${h.setupStatus}]`);
      }
    }
  }

  const allHouses = await prisma.house.findMany({
    include: {
      floors: {
        include: {
          floorPlan: {
            include: {
              devices: true,
            },
          },
          rooms: true,
        },
      },
      customer: true,
    },
  });

  console.log('\n--- ALL HOUSES IN DB ---');
  for (const h of allHouses) {
    console.log(`House: ${h.name} (${h.id}) - Status: ${h.setupStatus} - Owner: ${h.customer?.fullName || h.clientName || 'none'}`);
    for (const f of h.floors) {
      console.log(`  Floor: ${f.name} (Rooms: ${f.rooms.length}, Devices on Plan: ${f.floorPlan?.devices.length || 0})`);
      console.log(`  Plan: ${f.floorPlan?.id} (Image: ${f.floorPlan?.imagePath}, PPM: ${f.floorPlan?.pixelsPerMeter})`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
