/**
 * VERIFY MANUAL SCENARIOS SCRIPT (PHASE 4)
 *
 * Menguji seluruh 8 poin pengujian yang diminta user terhadap data nyata di database:
 * 1. Persiapan data & akun
 * 2. Pengujian Customer A & Customer B
 * 3. Pengujian pembatasan properti CONFIGURING (A2 vs A1)
 * 4. Pengujian IoT & Device Control (A1 vs B1)
 * 5. Pengujian Otomasi & Riwayat Eksekusi
 * 6. Pengujian Teknisi (Technician X & Y tanpa assignment)
 * 7. Pengujian Super Admin (Omniscient, Legacy Unassigned, Studio 3D)
 * 8. Pengujian IDOR & Validasi UUID
 */

import http from 'http';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

async function run() {
  console.log('===================================================================');
  console.log('🧪 VERIFIKASI 8 SEKSI PENGUJIAN MANUAL USER (PHASE 4)');
  console.log('===================================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;

  const helper = async (url: string, options: any = {}) => {
    const res = await fetch(`${baseUrl}${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Ambil Kredensial & Token
    // -------------------------------------------------------------------------
    console.log('--- 1. Login Akun-Akun Skenario ---');
    
    // Admin
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data.data.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin login berhasil');

    // Customer A
    const custALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.a@smarthome.id', password: 'customer123' }),
    });
    const custAToken = custALogin.data.data.token;
    assert(custALogin.status === 200 && !!custAToken, 'Customer A login berhasil');

    // Customer B
    const custBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.b@smarthome.id', password: 'customer123' }),
    });
    const custBToken = custBLogin.data.data.token;
    assert(custBLogin.status === 200 && !!custBToken, 'Customer B login berhasil');

    // Technician X
    const techXLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'technician.x@smarthome.id', password: 'tech123' }),
    });
    const techXToken = techXLogin.data.data.token;
    assert(techXLogin.status === 200 && !!techXToken, 'Technician X login berhasil');

    // Technician Y
    const techYLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'technician.y@smarthome.id', password: 'tech123' }),
    });
    const techYToken = techYLogin.data.data.token;
    assert(techYLogin.status === 200 && !!techYToken, 'Technician Y login berhasil');

    // Ambil data referensi dari DB
    const houseA1 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah A1 (Active)' } });
    const houseA2 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah A2 (Configuring)' } });
    const houseB1 = await prisma.house.findFirstOrThrow({ where: { name: 'Rumah B1 (Active)' } });
    const legacyHouse = await prisma.house.findFirstOrThrow({ where: { customerId: null } });

    const devA1 = await prisma.device.findFirstOrThrow({ where: { houseId: houseA1.id, name: 'Lampu Ruang Tamu A1' } });
    const devA1_AC = await prisma.device.findFirstOrThrow({ where: { houseId: houseA1.id, name: 'AC Kamar Tidur A1' } });
    const devA2 = await prisma.device.findFirstOrThrow({ where: { houseId: houseA2.id } });
    const devB1 = await prisma.device.findFirstOrThrow({ where: { houseId: houseB1.id, name: 'Lampu Utama B1' } });

    const floorPlanA1 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseA1.id } } });
    const floorPlanA2 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseA2.id } } });
    const floorPlanB1 = await prisma.floorPlan.findFirstOrThrow({ where: { floor: { houseId: houseB1.id } } });

    const roomA1 = await prisma.room.findFirstOrThrow({ where: { floorRel: { houseId: houseA1.id } } });
    const roomA2 = await prisma.room.findFirstOrThrow({ where: { floorRel: { houseId: houseA2.id } } });
    const roomB1 = await prisma.room.findFirstOrThrow({ where: { floorRel: { houseId: houseB1.id } } });

    const ruleA1 = await prisma.automationRule.findFirstOrThrow({ where: { houseId: houseA1.id } });
    const ruleB1 = await prisma.automationRule.findFirstOrThrow({ where: { houseId: houseB1.id } });

    // -------------------------------------------------------------------------
    // 2. Pengujian Customer (Customer A)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Pengujian Customer A ---');
    
    // 2.1 Membuka daftar properti (hanya A1 dan A2)
    const custAHouses = await helper('/api/houses', {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custAHouses.status === 200, 'Customer A GET /api/houses status 200');
    const custAHouseIds = custAHouses.data.data.map((h: any) => h.id);
    assert(custAHouseIds.includes(houseA1.id) && custAHouseIds.includes(houseA2.id), 'Daftar berisi A1 dan A2');
    assert(!custAHouseIds.includes(houseB1.id), 'Daftar TIDAK berisi B1 (milik Customer B)');

    // 2.2 Membuka detail A1
    const resA1 = await helper(`/api/houses/${houseA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resA1.status === 200, 'Customer A membuka detail A1 berhasil (200 OK)');

    // 2.3 Membuka detail A2 (ringkasan metadata)
    const resA2 = await helper(`/api/houses/${houseA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resA2.status === 200 && resA2.data.data.setupStatus === 'CONFIGURING', 'Customer A membuka detail A2 metadata berhasil');

    // 2.4 Membuka properti B1 melalui URL langsung
    const resB1byA = await helper(`/api/houses/${houseB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resB1byA.status === 403, 'Customer A membuka properti B1 via URL langsung DITOLAK (HTTP 403)');

    // 2.5 Mengganti houseId pada request API menjadi B1
    const resAQueryB1 = await helper(`/api/houses?customerId=other-fake-id`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resAQueryB1.status === 403, 'Customer A memfilter customerId lain pada /api/houses DITOLAK (HTTP 403)');

    // 2.6 Membuat properti baru melalui API
    const resCreateHouse = await helper('/api/houses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({ name: 'Rumah Ilegal Mandiri' }),
    });
    assert(resCreateHouse.status === 403, 'Customer A POST /api/houses membuat rumah mandiri DITOLAK (HTTP 403)');

    // 2.7 Membuka dashboard A1
    const resDashA1 = await helper(`/api/dashboard?houseId=${houseA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDashA1.status === 200, 'Customer A membuka dashboard A1 berhasil (200 OK)');

    // 2.8 Membuka dashboard B1
    const resDashB1 = await helper(`/api/dashboard?houseId=${houseB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDashB1.status === 403, 'Customer A membuka dashboard B1 DITOLAK (HTTP 403)');

    // -------------------------------------------------------------------------
    // 3. Pengujian Pembatasan Properti CONFIGURING (A2 vs A1)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Pengujian Pembatasan Properti CONFIGURING (A2 vs A1) ---');
    
    // A2: Denah 2D
    const resPlanA2 = await helper(`/api/floor-plans/${floorPlanA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resPlanA2.status === 403, 'Akses denah 2D A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Ruangan
    const resRoomA2 = await helper(`/api/rooms/${roomA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resRoomA2.status === 403, 'Akses ruangan A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Perangkat
    const resDevA2 = await helper(`/api/devices/${devA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDevA2.status === 403, 'Akses detail perangkat A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Telemetry
    const resStateA2 = await helper(`/api/devices/${devA2.id}/state`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resStateA2.status === 403, 'Akses telemetri perangkat A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Kontrol ON/OFF
    const resCtrlA2 = await helper(`/api/devices/${devA2.id}/control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({ action: 'TURN_ON' }),
    });
    assert(resCtrlA2.status === 403, 'Kontrol perangkat A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Automations
    const resAutoA2 = await helper(`/api/automations?houseId=${houseA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resAutoA2.status === 403, 'Akses aturan otomasi A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Dashboard Operasional
    const resDashA2 = await helper(`/api/dashboard?houseId=${houseA2.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDashA2.status === 403, 'Dashboard operasional A2 (CONFIGURING) DITOLAK (HTTP 403)');

    // A2: Survei teknisi
    const resSurveyA2 = await helper(`/api/houses/${houseA2.id}/surveys`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resSurveyA2.status === 403, 'Akses survei internal A2 oleh Customer DITOLAK (HTTP 403)');

    // SEBALIKNYA: A1 (ACTIVE) semua operasional tersedia
    const resPlanA1 = await helper(`/api/floor-plans/${floorPlanA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resPlanA1.status === 200, 'Akses denah 2D A1 (ACTIVE) BERHASIL (HTTP 200)');

    const resRoomA1 = await helper(`/api/rooms/${roomA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resRoomA1.status === 200, 'Akses ruangan A1 (ACTIVE) BERHASIL (HTTP 200)');

    const resDevA1 = await helper(`/api/devices/${devA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDevA1.status === 200, 'Akses perangkat A1 (ACTIVE) BERHASIL (HTTP 200)');

    // -------------------------------------------------------------------------
    // 4. Pengujian IoT & Kontrol Perangkat (A1 vs B1)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Pengujian IoT & Kontrol Perangkat (A1 vs B1) ---');
    
    // Membaca daftar perangkat A1
    const resDevsA1 = await helper(`/api/dashboard/devices?houseId=${houseA1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDevsA1.status === 200 && resDevsA1.data.data.length >= 2, 'Customer A membaca daftar perangkat A1 berhasil');

    // Membaca telemetry A1
    const resTelA1 = await helper(`/api/devices/${devA1.id}/state`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resTelA1.status === 200, 'Customer A membaca telemetry perangkat A1 berhasil');

    // Mengontrol perangkat A1 (Lampu ON/OFF)
    const resCtrlA1 = await helper(`/api/devices/${devA1.id}/control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({ action: 'TURN_OFF' }),
    });
    assert(resCtrlA1.status === 200, 'Customer A mengontrol perangkat A1 berhasil (200 OK)');

    // Mengakses perangkat B1
    const resGetB1 = await helper(`/api/devices/${devB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resGetB1.status === 403, 'Customer A mengakses perangkat B1 DITOLAK (HTTP 403)');

    // Mengontrol perangkat B1
    const resCtrlB1 = await helper(`/api/devices/${devB1.id}/control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({ action: 'TURN_ON' }),
    });
    assert(resCtrlB1.status === 403, 'Customer A mengontrol perangkat B1 DITOLAK (HTTP 403)');

    // Menggunakan device ID milik B1 pada request dashboard A1
    const resCrossDev = await helper(`/api/dashboard/devices?houseId=${houseA1.id}&roomId=${roomB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resCrossDev.status === 400, 'Injeksi roomId B1 ke query dashboard A1 DITOLAK (HTTP 400)');

    // -------------------------------------------------------------------------
    // 5. Pengujian Otomasi & Riwayat Eksekusi
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Pengujian Otomasi & Riwayat Eksekusi ---');
    
    // 5.1 Buat automation baru pada A1
    const resCreateRule = await helper('/api/automations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        houseId: houseA1.id,
        name: 'Auto AC Suhu Sejuk A1',
        conditions: [
          {
            type: 'DEVICE_STATE',
            deviceId: devA1_AC.id,
            property: 'status',
            operator: '==',
            value: 'OFF',
          },
        ],
        actions: [
          {
            deviceId: devA1_AC.id,
            commandType: 'SET_POWER',
            payload: { power: true },
          },
        ],
      }),
    });
    assert(resCreateRule.status === 201, 'Customer A membuat automation pada A1 BERHASIL (HTTP 201)');
    const createdRuleId = resCreateRule.data.data.id;

    // 5.2 Edit automation
    const resEditRule = await helper(`/api/automations/${createdRuleId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        name: 'Auto AC Suhu Sejuk A1 (Updated)',
      }),
    });
    assert(resEditRule.status === 200, 'Customer A mengedit automation A1 BERHASIL (HTTP 200)');

    // 5.3 Aktifkan / Nonaktifkan automation (toggle)
    const resToggleRule = await helper(`/api/automations/${createdRuleId}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resToggleRule.status === 200, 'Customer A toggle automation A1 BERHASIL (HTTP 200)');

    // 5.4 Hapus automation
    const resDelRule = await helper(`/api/automations/${createdRuleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resDelRule.status === 200, 'Customer A menghapus automation A1 BERHASIL (HTTP 200)');

    // 5.5 Injeksi device B1 ke dalam kondisi automation A1
    const resInjectCond = await helper('/api/automations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        houseId: houseA1.id,
        name: 'Injeksi Kondisi B1',
        conditions: [
          {
            type: 'DEVICE_STATE',
            deviceId: devB1.id, // Milik B1!
            property: 'status',
            operator: '==',
            value: 'ON',
          },
        ],
        actions: [
          {
            deviceId: devA1.id,
            commandType: 'SET_POWER',
            payload: { power: false },
          },
        ],
      }),
    });
    assert(resInjectCond.status === 400, 'Injeksi device B1 pada kondisi otomasi A1 DITOLAK (HTTP 400)');

    // 5.6 Injeksi device B1 ke dalam action automation A1
    const resInjectAct = await helper('/api/automations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
      body: JSON.stringify({
        houseId: houseA1.id,
        name: 'Injeksi Aksi B1',
        conditions: [
          {
            type: 'DEVICE_STATE',
            deviceId: devA1.id,
            property: 'status',
            operator: '==',
            value: 'ON',
          },
        ],
        actions: [
          {
            deviceId: devB1.id, // Milik B1!
            commandType: 'SET_POWER',
            payload: { power: false },
          },
        ],
      }),
    });
    assert(resInjectAct.status === 400, 'Injeksi device B1 pada aksi otomasi A1 DITOLAK (HTTP 400)');

    // 5.7 Membuka automation milik B1
    const resGetRuleB1 = await helper(`/api/automations/${ruleB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resGetRuleB1.status === 403, 'Customer A membuka rule B1 DITOLAK (HTTP 403)');

    // 5.8 Riwayat Eksekusi
    // Customer A riwayat
    const resCustAHist = await helper('/api/automation-executions', {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resCustAHist.status === 200, 'Customer A membuka /api/automation-executions BERHASIL (HTTP 200)');
    // Memastikan tidak ada rule dari B1
    const leakedRules = resCustAHist.data.data.filter((e: any) => e.ruleId === ruleB1.id);
    assert(leakedRules.length === 0, 'Riwayat Customer A nol kebocoran data dari properti B1');

    // Customer A query B1 secara eksplisit
    const resCustAHistB1 = await helper(`/api/automation-executions?houseId=${houseB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(resCustAHistB1.status === 403, 'Customer A query eksekusi properti B1 DITOLAK (HTTP 403)');

    // Admin riwayat global
    const resAdminHist = await helper('/api/automation-executions', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(resAdminHist.status === 200, 'Super Admin membuka riwayat global BERHASIL (HTTP 200)');

    // -------------------------------------------------------------------------
    // 6. Pengujian Teknisi (Technician X & Y tanpa assignment)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Pengujian Teknisi (Technician X & Y) ---');
    
    // Tech X
    const techXHouses = await helper('/api/houses', {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXHouses.status === 200 && techXHouses.data.data.length === 0, 'Technician X GET /api/houses mengembalikan list kosong (belum ada assignment)');

    const techXDetailA1 = await helper(`/api/houses/${houseA1.id}`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXDetailA1.status === 403, 'Technician X detail properti A1 DITOLAK (HTTP 403)');

    const techXDetailB1 = await helper(`/api/houses/${houseB1.id}`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXDetailB1.status === 403, 'Technician X detail properti B1 DITOLAK (HTTP 403)');

    const techXPlan = await helper(`/api/floor-plans/${floorPlanA1.id}`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXPlan.status === 403, 'Technician X akses denah 2D DITOLAK (HTTP 403)');

    const techXDev = await helper(`/api/devices/${devA1.id}`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXDev.status === 403, 'Technician X akses data perangkat DITOLAK (HTTP 403)');

    const techXSurvey = await helper(`/api/houses/${houseA1.id}/surveys`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXSurvey.status === 403, 'Technician X akses survei tanpa assignment DITOLAK (HTTP 403)');

    const techXDash = await helper(`/api/dashboard?houseId=${houseA1.id}`, {
      headers: { Authorization: `Bearer ${techXToken}` },
    });
    assert(techXDash.status === 403, 'Technician X akses dashboard DITOLAK (HTTP 403)');

    // Tech Y
    const techYDetailA1 = await helper(`/api/houses/${houseA1.id}`, {
      headers: { Authorization: `Bearer ${techYToken}` },
    });
    assert(techYDetailA1.status === 403, 'Technician Y detail properti A1 DITOLAK (HTTP 403)');

    // -------------------------------------------------------------------------
    // 7. Pengujian Super Admin
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Pengujian Super Admin ---');
    
    // Melihat seluruh properti
    const adminHouses = await helper('/api/houses', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminHouses.status === 200, 'Super Admin GET /api/houses status 200');
    const adminHouseIds = adminHouses.data.data.map((h: any) => h.id);
    assert(
      adminHouseIds.includes(houseA1.id) &&
      adminHouseIds.includes(houseA2.id) &&
      adminHouseIds.includes(houseB1.id) &&
      adminHouseIds.includes(legacyHouse.id),
      'Super Admin melihat seluruh properti (A1, A2, B1, dan Legacy Unassigned)'
    );

    // Membuka properti CONFIGURING (A2)
    const adminA2 = await helper(`/api/houses/${houseA2.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminA2.status === 200, 'Super Admin membuka properti non-ACTIVE (A2) BERHASIL (HTTP 200)');

    // Membuka dashboard properti CONFIGURING (A2)
    const adminDashA2 = await helper(`/api/dashboard?houseId=${houseA2.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminDashA2.status === 200, 'Super Admin membuka dashboard A2 (CONFIGURING) BERHASIL (HTTP 200)');

    // Mengakses denah 2D
    const adminPlan = await helper(`/api/floor-plans/${floorPlanA1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminPlan.status === 200, 'Super Admin mengakses denah 2D BERHASIL (HTTP 200)');

    // Mengakses 3D models
    const admin3D = await helper('/api/house-models', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(admin3D.status === 200, 'Super Admin membuka 3D Studio models BERHASIL (HTTP 200)');

    // Mengakses daftar perangkat
    const adminDevs = await helper(`/api/dashboard/devices?houseId=${houseA1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminDevs.status === 200, 'Super Admin melihat daftar perangkat BERHASIL (HTTP 200)');

    // Mengakses telemetry
    const adminTel = await helper(`/api/devices/${devA1.id}/state`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminTel.status === 200, 'Super Admin mengakses telemetry BERHASIL (HTTP 200)');

    // Mengontrol perangkat
    const adminCtrl = await helper(`/api/devices/${devA1.id}/control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ action: 'TURN_ON' }),
    });
    assert(adminCtrl.status === 200, 'Super Admin mengontrol perangkat virtual BERHASIL (HTTP 200)');

    // Mengakses automations
    const adminAuto = await helper(`/api/automations?houseId=${houseA1.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminAuto.status === 200, 'Super Admin mengakses automations BERHASIL (HTTP 200)');

    // Mengakses survei teknisi internal
    const adminSurvey = await helper(`/api/houses/${houseA1.id}/surveys`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminSurvey.status === 200, 'Super Admin mengakses informasi survey BERHASIL (HTTP 200)');

    // Mengakses legacy unassigned house
    const adminLegacy = await helper(`/api/houses/${legacyHouse.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(adminLegacy.status === 200, 'Super Admin mengakses rumah legacy unassigned BERHASIL (HTTP 200)');

    // -------------------------------------------------------------------------
    // 8. Pengujian IDOR & Keamanan API
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Pengujian IDOR & Keamanan API ---');
    
    // Mengganti houseId Customer A menjadi B1 pada detail
    const idorHouse = await helper(`/api/houses/${houseB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(idorHouse.status === 403, 'IDOR houseId B1 DITOLAK (HTTP 403)');

    // Mengganti deviceId menjadi perangkat B1
    const idorDev = await helper(`/api/devices/${devB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(idorDev.status === 403, 'IDOR deviceId B1 DITOLAK (HTTP 403)');

    // Mengganti roomId menjadi ruangan B1
    const idorRoom = await helper(`/api/rooms/${roomB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(idorRoom.status === 403, 'IDOR roomId B1 DITOLAK (HTTP 403)');

    // Mengganti floorPlanId menjadi milik B1
    const idorPlan = await helper(`/api/floor-plans/${floorPlanB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(idorPlan.status === 403, 'IDOR floorPlanId B1 DITOLAK (HTTP 403)');

    // Mengganti automationId menjadi milik B1
    const idorRule = await helper(`/api/automations/${ruleB1.id}`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(idorRule.status === 403, 'IDOR automationId B1 DITOLAK (HTTP 403)');

    // Mengakses endpoint survei sebagai Customer
    const custSurvey = await helper(`/api/houses/${houseA1.id}/surveys`, {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custSurvey.status === 403, 'Akses endpoint survey sebagai Customer DITOLAK (HTTP 403)');

    // Mengakses endpoint publish sebagai Customer
    const custPublish = await helper(`/api/publish/houses/${houseA1.id}/preview`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custPublish.status === 403, 'Akses endpoint publish sebagai Customer DITOLAK (HTTP 403)');

    // Mengakses endpoint provider sebagai Customer
    const custProvider = await helper('/api/providers', {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(custProvider.status === 403, 'Akses endpoint provider sebagai Customer DITOLAK (HTTP 403)');

    // Mengirim UUID yang tidak valid
    const badUuidRes = await helper('/api/houses/bukan-uuid', {
      headers: { Authorization: `Bearer ${custAToken}` },
    });
    assert(badUuidRes.status === 400, 'UUID tidak valid ditolak dengan HTTP 400 Bad Request');
  } finally {
    server.close();
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 HASIL PENGUJIAN: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal error during test:', e);
  process.exit(1);
});
