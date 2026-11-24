/**
 * Seed script for Commercial Service Packages (Phase 6)
 * Idempotently creates standard commercial package offerings.
 */

import { prisma, disconnectDatabase } from '../services/db.service.js';
import { servicePackageService } from '../services/service-package.service.js';

export async function seedServicePackages() {
  console.log('🌱 Seeding initial commercial service packages...');

  const packagesData = [
    {
      name: 'Smart Living Digital Twin 2D',
      code: 'smart-living-digital-2d',
      shortDescription: 'Digital twin denah 2D interaktif dan manajemen zonasi ruangan tanpa sensor fisik.',
      description:
        'Paket digitalisasi hunian non-IoT. Tim teknisi melakukan survei tata ruang, memetakan denah 2D interaktif berkalibrasi akurat, mengelompokkan zonasi ruangan, serta menyediakan dashboard monitoring hunian digital yang bersih tanpa ketergantungan perangkat keras.',
      price: 1500000,
      currency: 'IDR',
      estimatedDuration: '2-3 Hari Kerja',
      status: 'ACTIVE' as const,
      displayOrder: 1,
      maxRooms: 8,
      maxDevices: 0,
      includedAutomations: 0,
      hasPhysicalIot: false,
      hasThreeD: false,
      inclusions: [
        {
          category: 'PROPERTY_SURVEY' as const,
          displayName: 'Survei Hunian & Layout Digital',
          description: 'Pengukuran dimensi ruangan dan dokumentasi tata letak properti.',
          isIncluded: true,
        },
        {
          category: 'FLOOR_PLAN_2D' as const,
          displayName: 'Pemetaan Denah 2D Interaktif Multi-Lantai',
          description: 'Digitalisasi denah SVG dengan koordinat ternormalisasi dan zonasi ruangan interaktif.',
          isIncluded: true,
          quantity: 2,
        },
        {
          category: 'SMART_HOME_DASHBOARD' as const,
          displayName: 'Akses Portal Dashboard Hunian',
          description: 'Akses client portal untuk pemantauan tata ruang properti keluarga.',
          isIncluded: true,
        },
        {
          category: 'TRAINING_AND_HANDOVER' as const,
          displayName: 'Panduan Digital & Berita Acara Serah Terima',
          description: 'Serah terima digital twin resmi dan panduan penggunaan aplikasi.',
          isIncluded: true,
        },
        {
          category: 'IOT_DEVICE_INSTALLATION' as const,
          displayName: 'Instalasi Perangkat Keras IoT Fisik',
          description: 'Tidak disertakan pada paket digital non-IoT.',
          isIncluded: false,
        },
        {
          category: 'THREE_D_MODEL' as const,
          displayName: 'Model Virtual 3D GLB Dollhouse',
          description: 'Dapat di-upgrade pada paket premium.',
          isIncluded: false,
        },
      ],
    },
    {
      name: 'Smart Home Essential IoT',
      code: 'smart-home-essential-iot',
      shortDescription: 'Solusi smart home lengkap dengan denah 2D, saklar cerdas, dan otomasi sensor.',
      description:
        'Paket smart home komersial paling populer. Menggabungkan denah 2D digital interaktif dengan instalasi perangkat keras IoT fisik (saklar lampu, sensor lingkungan, dan modul pintar). Dilengkapi konfigurasi otomasi cerdas dan kendali jarak jauh melalui dashboard.',
      price: 3500000,
      currency: 'IDR',
      estimatedDuration: '4-6 Hari Kerja',
      status: 'ACTIVE' as const,
      displayOrder: 2,
      maxRooms: 8,
      maxDevices: 12,
      includedAutomations: 5,
      hasPhysicalIot: true,
      hasThreeD: false,
      inclusions: [
        {
          category: 'PROPERTY_SURVEY' as const,
          displayName: 'Survei Lapangan & Analisis Titik Kelistrikan',
          description: 'Pemeriksaan jalur kabel, jangkauan sinyal, dan penentuan posisi sensor.',
          isIncluded: true,
        },
        {
          category: 'FLOOR_PLAN_2D' as const,
          displayName: 'Denah 2D Interaktif Terintegrasi IoT',
          description: 'Penempatan pin perangkat IoT interaktif langsung pada denah lantai.',
          isIncluded: true,
          quantity: 2,
        },
        {
          category: 'IOT_DEVICE_INSTALLATION' as const,
          displayName: 'Pemasangan Modul Saklar & Sensor Fisik',
          description: 'Instalasi perangkat keras certified smart switches dan climate sensors.',
          isIncluded: true,
          quantity: 8,
        },
        {
          category: 'IOT_DEVICE_CONFIGURATION' as const,
          displayName: 'Konfigurasi Protokol & Telemetri Real-Time',
          description: 'Pengaturan konektivitas, telemetry logging, dan integrasi provider aman.',
          isIncluded: true,
        },
        {
          category: 'AUTOMATION_CONFIGURATION' as const,
          displayName: 'Pengaturan 5 Skenario Otomasi Cerdas',
          description: 'Konfigurasi aturan otomatisasi lampu, suhu, dan keamanan rumah.',
          isIncluded: true,
          quantity: 5,
        },
        {
          category: 'SMART_HOME_DASHBOARD' as const,
          displayName: 'Executive Dashboard & Kontrol Interaktif',
          description: 'Kendali saklar real-time, monitoring grafik lingkungan, dan riwayat aktivitas.',
          isIncluded: true,
        },
        {
          category: 'TRAINING_AND_HANDOVER' as const,
          displayName: 'Pelatihan Operasional & Garansi Konfigurasi',
          description: 'Demonstrasi penggunaan aplikasi kepada penghuni dan verifikasi uji kelayakan.',
          isIncluded: true,
        },
        {
          category: 'THREE_D_MODEL' as const,
          displayName: 'Model Virtual 3D GLB Dollhouse',
          description: 'Tersedia eksklusif pada paket Villa Premium.',
          isIncluded: false,
        },
      ],
    },
    {
      name: 'Smart Villa Premium 3D + IoT',
      code: 'smart-villa-premium-3d-iot',
      shortDescription: 'Digital twin 3D GLB fotorealistik dengan ekosistem IoT cerdas dan otomasi tingkat lanjut.',
      description:
        'Paket flagship premium untuk hunian mewah dan villa. Menghadirkan model 3D GLB Dollhouse fotorealistik berkalibrasi spasial penuh, integrasi hingga 30 perangkat pintar, otomasi skenario tak terbatas, survei prioritas oleh teknisi senior, dan dukungan pemeliharaan berkala.',
      price: 7500000,
      currency: 'IDR',
      estimatedDuration: '7-10 Hari Kerja',
      status: 'ACTIVE' as const,
      displayOrder: 3,
      maxRooms: 15,
      maxDevices: 30,
      includedAutomations: 20,
      hasPhysicalIot: true,
      hasThreeD: true,
      inclusions: [
        {
          category: 'PROPERTY_SURVEY' as const,
          displayName: 'Survei Arsitektural & Jaringan Prioritas',
          description: 'Pemindaian 3D dan analisis topologi IoT multi-lantai.',
          isIncluded: true,
        },
        {
          category: 'FLOOR_PLAN_2D' as const,
          displayName: 'Denah 2D Akurasi Tinggi Seluruh Lantai',
          description: 'Pemetaan denah lengkap dengan kalibrasi rasio meter-ke-piksel presisi.',
          isIncluded: true,
        },
        {
          category: 'THREE_D_MODEL' as const,
          displayName: 'Digital Twin 3D GLB Dollhouse Interaktif',
          description: 'Eksplorasi ruang 3D interaktif Three.js dengan rotasi dan inspeksi objek.',
          isIncluded: true,
        },
        {
          category: 'GLB_ASSET_PREPARATION' as const,
          displayName: 'Inspeksi & Binding Semantik Spasial 3D',
          description: 'Penetapan anchor node dan identifikasi ruangan pada model 3D.',
          isIncluded: true,
        },
        {
          category: 'IOT_DEVICE_INSTALLATION' as const,
          displayName: 'Instalasi Lengkap Ekosistem IoT Cerdas',
          description: 'Pemasangan hingga 20 titik sensor, saklar, dan aktuator pintar.',
          isIncluded: true,
          quantity: 20,
        },
        {
          category: 'AUTOMATION_CONFIGURATION' as const,
          displayName: '20 Skenario Otomasi Cerdas Multi-Ruangan',
          description: 'Skenario pintar terjadwal, adaptasi cuaca, dan mode keamanan terpadu.',
          isIncluded: true,
          quantity: 20,
        },
        {
          category: 'SMART_HOME_DASHBOARD' as const,
          displayName: 'Full-Suite Smart Home Command Center',
          description: 'Portal pemantauan multi-properti dengan kontrol terpusat komprehensif.',
          isIncluded: true,
        },
        {
          category: 'TRAINING_AND_HANDOVER' as const,
          displayName: 'Pelatihan VIP & Dokumen Jaminan Layanan',
          description: 'Pendampingan langsung teknisi senior dan buku panduan personal.',
          isIncluded: true,
        },
      ],
    },
    {
      name: 'Custom Enterprise Suite (Draft)',
      code: 'custom-enterprise-suite',
      shortDescription: 'Paket kustom skala besar untuk komersial properti atau kantor (dalam penyusunan).',
      description:
        'Paket penawaran khusus untuk kawasan residensial kluster atau gedung perkantoran. Masih dalam status DRAFT untuk pengujian tata kelola internal katalog.',
      price: 15000000,
      currency: 'IDR',
      estimatedDuration: '14 Hari Kerja',
      status: 'DRAFT' as const,
      displayOrder: 4,
      maxRooms: 50,
      maxDevices: 100,
      includedAutomations: 50,
      hasPhysicalIot: true,
      hasThreeD: true,
      inclusions: [
        {
          category: 'PROPERTY_SURVEY' as const,
          displayName: 'Audit & Konsultasi Tata Kelola Spasial',
          description: 'Perencanaan master plan digitalisasi komersial.',
          isIncluded: true,
        },
      ],
    },
  ];

  for (const pkg of packagesData) {
    const existing = await prisma.servicePackage.findUnique({
      where: { code: pkg.code },
    });
    if (!existing) {
      await servicePackageService.createPackage(pkg as any);
      console.log(`  ✅ Created package: ${pkg.name} (${pkg.code}) [${pkg.status}]`);
    } else {
      console.log(`  ℹ️ Package already exists: ${pkg.name} (${pkg.code})`);
      const existingInclusionsCount = await prisma.servicePackageInclusion.count({
        where: { packageId: existing.id },
      });
      if (existingInclusionsCount === 0 && pkg.inclusions && pkg.inclusions.length > 0) {
        console.log(`  🔧 Populating missing inclusions for: ${pkg.name} (${pkg.inclusions.length} items)...`);
        await prisma.servicePackageInclusion.createMany({
          data: pkg.inclusions.map((inc, i) => ({
            packageId: existing.id,
            category: inc.category,
            displayName: inc.displayName,
            description: inc.description || null,
            isIncluded: inc.isIncluded !== false,
            quantity: (inc as any).quantity || null,
            displayOrder: i + 1,
          })),
        });
      }
    }
  }

  console.log('✨ Commercial service package seeding completed.');
}

if (process.argv[1]?.endsWith('seed-service-packages.ts')) {
  seedServicePackages()
    .catch((e) => {
      console.error('Failed to seed service packages:', e);
      process.exit(1);
    })
    .finally(() => disconnectDatabase());
}
