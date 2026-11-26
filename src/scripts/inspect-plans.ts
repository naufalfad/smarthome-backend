import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.floorPlan.findMany({
    include: {
      floor: {
        include: {
          house: true,
          rooms: true,
        },
      },
      devices: true,
    },
  });

  for (const p of plans) {
    console.log({
      id: p.id,
      name: p.name,
      imagePath: p.imagePath,
      imageWidth: p.imageWidth,
      imageHeight: p.imageHeight,
      pixelsPerMeter: p.pixelsPerMeter,
      calibrationPoints: p.calibrationPoints,
      rooms: p.floor.rooms.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        polygonCoordinates: r.polygonCoordinates,
        area: r.areaSquareMeters
      })),
      devices: p.devices.map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        x: d.x,
        y: d.y,
        normalizedX: d.normalizedX,
        normalizedY: d.normalizedY,
        roomId: d.roomId
      }))
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
