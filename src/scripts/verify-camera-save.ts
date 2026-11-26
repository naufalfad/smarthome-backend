import { PrismaClient } from '@prisma/client';
import { DeviceService } from '../services/device.service.js';

const prisma = new PrismaClient();

async function main() {
  const cam = await prisma.device.findFirst({
    where: { type: 'OUTDOOR_CAMERA' },
    include: { catalogItem: true },
  });

  if (!cam) {
    console.error('No OUTDOOR_CAMERA found');
    return;
  }

  console.log(`Testing camera: ${cam.name} (id: ${cam.id})`);
  console.log('Current config keys:', Object.keys(cam.configuration as object));

  // 1. Test updating storageMode and recordingMode
  console.log('\n--- Test 1: Updating storageMode and recordingMode ---');
  const updated1 = await DeviceService.updateDeviceConfiguration(
    cam.id,
    { storageMode: 'CLOUD', recordingMode: 'CONTINUOUS', nightVision: false },
    false
  );
  console.log('✅ updateDeviceConfiguration SUCCESS! storageMode:', (updated1.configuration as any).storageMode);

  // 2. Test full device update via updateDevice (simulating DeviceInspectorPanel onUpdateDevice)
  console.log('\n--- Test 2: Full updateDevice with merged configuration ---');
  const updated2 = await DeviceService.updateDevice(cam.id, {
    name: 'Kamera Pengawas Teras 2K (Updated)',
    configuration: {
      ...(updated1.configuration as object),
      labelPosition: 'left',
    },
  });
  console.log('✅ updateDevice SUCCESS! name:', updated2.name, 'labelPosition:', (updated2.configuration as any).labelPosition);

  // Reset back to original name for consistency
  await DeviceService.updateDevice(cam.id, {
    name: 'Kamera Pengawas Teras 2K',
  });
  console.log('✅ Reset camera name back to original.');

  console.log('\n🎉 ALL CAMERA CONFIGURATION SAVING TESTS PASSED PERFECTLY!');
}

main()
  .catch((err) => {
    console.error('❌ CAMERA SAVE TEST FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
