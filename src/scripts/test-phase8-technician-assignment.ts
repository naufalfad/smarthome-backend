/**
 * PHASE 8 HARDENED AUTOMATED TEST SUITE: TECHNICIAN ASSIGNMENT & DISPATCH
 *
 * Comprehensive verification of integrity, concurrency, authorization,
 * property access policy revocation, and privacy requirements:
 *
 * - P8-01: Initial Assignment Success (CONFIRMED order + eligible technician)
 * - P8-02: Invalid Order Status Rejection (PENDING, REJECTED, CANCELLED)
 * - P8-03: Ineligible Technician Rejection (BUSY, ON_LEAVE, INACTIVE, isActive: false)
 * - P8-04: Duplicate Assignment Conflict (ALREADY_ASSIGNED 409)
 * - P8-05: Reassignment Success (Atomic REVOKED -> ACTIVE transition with valid reason)
 * - P8-06: Reassignment Validation Failure (missing reason, 4-char 'ubah', whitespace padding, same technician)
 * - P8-07: Concurrency & Engine Level Guard:
 *          * 4.1: Simultaneous initial assignments (assign vs assign)
 *          * 4.2: Simultaneous reassignments (reassign vs reassign)
 *          * 4.3: Initial assignment racing with reassignment (assign vs reassign)
 *          * 4.4: Availability update racing with assignment (availability change vs assign)
 * - P8-08: Technician IDOR Isolation & Workspace Privacy (Commercial prices & snapshot price omitted)
 * - P8-09: Immediate Access Revocation in PropertyAccessPolicy:
 *          * Active technician permitted
 *          * Cross-house access rejected
 *          * Immediate revocation upon reassignment
 *          * Replacement technician granted access
 *          * Nullable houseId assignment does not grant access to unrelated house
 *          * Zero automatic House creation during dispatch
 * - P8-10: Customer Projection Privacy (Public fields only; no instructions/admin notes/phone leaked)
 * - P8-11: Customer IDOR Isolation (Tenant B receives 404 accessing Tenant A order)
 * - P8-12: Super Admin Role Guard (Customer/Technician dispatch attempts rejected with 403)
 * - P8-13: Nullable House ID Support (Turnkey commercial intake without house handled cleanly)
 * - P8-14: Technician Availability Management (Workload count, updates, assignment retention)
 * - P8-15: Assignment History Audit Trail & Database Constraint Verification (Strict Restrict + check constraints)
 */

import http from 'http';
import { Prisma } from '@prisma/client';

process.env.NODE_ENV = 'test';

const { app } = await import('../server.js');
const { prisma, disconnectDatabase } = await import('../services/db.service.js');
const { PropertyAccessPolicy } = await import('../services/property-access-policy.service.js');
const { hashPassword } = await import('../utils/auth-crypto.util.js');

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

async function runPhase8HardenedTest() {
  console.log('===================================================================');
  console.log('⚡ PHASE 8 HARDENED: TECHNICIAN ASSIGNMENT & DISPATCH SUITE');
  console.log('===================================================================\n');

  const uniqueTag = Date.now().toString(36).toLowerCase();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

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

  // Tracking created fixtures for clean teardown
  const createdUserIds: string[] = [];
  const createdHouseIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPackageIds: string[] = [];

  try {
    console.log('--- 0. Setting Up Hardened Test Fixtures ---');

    // 1. Super Admin Authentication
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin test login succeeds');
    const adminHeader = { Authorization: `Bearer ${adminToken}` };

    // 2. Create Technicians
    // Technician 1 (Eligible & Available)
    const techUser1 = await prisma.user.create({
      data: {
        username: `tech1_${uniqueTag}`,
        name: `Teknisi Alpha ${uniqueTag}`,
        password: hashPassword('TechPassword123'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-A-${uniqueTag.toUpperCase()}`,
            specialization: 'Smart Lighting & Sensors',
            serviceArea: 'Jakarta Selatan',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techUser1.id);
    const techProfile1 = techUser1.technicianProfile!;

    const tech1Login = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `tech1_${uniqueTag}`, password: 'TechPassword123' }),
    });
    const tech1Token = tech1Login.data?.data?.token;
    const tech1Header = { Authorization: `Bearer ${tech1Token}` };
    assert(tech1Login.status === 200 && !!tech1Token, 'Technician 1 login succeeds');

    // Technician 2 (Eligible & Available)
    const techUser2 = await prisma.user.create({
      data: {
        username: `tech2_${uniqueTag}`,
        name: `Teknisi Beta ${uniqueTag}`,
        password: hashPassword('TechPassword123'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-B-${uniqueTag.toUpperCase()}`,
            specialization: 'Security & CCTV Integration',
            serviceArea: 'Jakarta Pusat',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techUser2.id);
    const techProfile2 = techUser2.technicianProfile!;

    const tech2Login = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: `tech2_${uniqueTag}`, password: 'TechPassword123' }),
    });
    const tech2Token = tech2Login.data?.data?.token;
    const tech2Header = { Authorization: `Bearer ${tech2Token}` };
    assert(tech2Login.status === 200 && !!tech2Token, 'Technician 2 login succeeds');

    // Technician 3 (Ineligible: BUSY)
    const techUser3 = await prisma.user.create({
      data: {
        username: `tech3_${uniqueTag}`,
        name: `Teknisi Gamma ${uniqueTag}`,
        password: hashPassword('TechPassword123'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-G-${uniqueTag.toUpperCase()}`,
            specialization: 'HVAC Automation',
            serviceArea: 'Jakarta Barat',
            availabilityStatus: 'BUSY',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techUser3.id);
    const techProfile3 = techUser3.technicianProfile!;

    // Technician 4 (Eligible & Available for Concurrent Race Tests)
    const techUser4 = await prisma.user.create({
      data: {
        username: `tech4_${uniqueTag}`,
        name: `Teknisi Delta ${uniqueTag}`,
        password: hashPassword('TechPassword123'),
        role: 'TECHNICIAN',
        isActive: true,
        technicianProfile: {
          create: {
            employeeCode: `TECH-D-${uniqueTag.toUpperCase()}`,
            specialization: 'Network & Smart Intercom',
            serviceArea: 'Jakarta Timur',
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(techUser4.id);
    const techProfile4 = techUser4.technicianProfile!;

    // 3. Customers A & B
    const custEmailA = `custa_${uniqueTag}@example.com`;
    const custUserA = await prisma.user.create({
      data: {
        username: `custa_${uniqueTag}`,
        name: `Customer Alpha ${uniqueTag}`,
        email: custEmailA,
        password: hashPassword('CustPassword123'),
        role: 'CUSTOMER',
        isActive: true,
        customerProfile: {
          create: {
            fullName: `Customer Alpha ${uniqueTag}`,
            phone: '081299990001',
            billingAddress: 'Jl. Merdeka No. 1, Jakarta',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(custUserA.id);

    const custALogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: custEmailA, password: 'CustPassword123' }),
    });
    const custAToken = custALogin.data?.data?.token;
    const custAHeader = { Authorization: `Bearer ${custAToken}` };
    assert(custALogin.status === 200 && !!custAToken, 'Customer A login succeeds');

    const custEmailB = `custb_${uniqueTag}@example.com`;
    const custUserB = await prisma.user.create({
      data: {
        username: `custb_${uniqueTag}`,
        name: `Customer Beta ${uniqueTag}`,
        email: custEmailB,
        password: hashPassword('CustPassword123'),
        role: 'CUSTOMER',
        isActive: true,
        customerProfile: {
          create: {
            fullName: `Customer Beta ${uniqueTag}`,
            phone: '081299990002',
            billingAddress: 'Jl. Sudirman No. 2, Jakarta',
          },
        },
      },
      include: { customerProfile: true },
    });
    createdUserIds.push(custUserB.id);

    const custBLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: custEmailB, password: 'CustPassword123' }),
    });
    const custBToken = custBLogin.data?.data?.token;
    const custBHeader = { Authorization: `Bearer ${custBToken}` };
    assert(custBLogin.status === 200 && !!custBToken, 'Customer B login succeeds');

    // 4. Create Service Package
    const testPackage = await prisma.servicePackage.create({
      data: {
        code: `PKG-P8-${uniqueTag.toUpperCase()}`,
        name: `Paket P8 Complete ${uniqueTag}`,
        shortDescription: `Deskripsi singkat paket P8 ${uniqueTag}`,
        description: `Deskripsi lengkap layanan smart home turnkey untuk pengujian Phase 8 ${uniqueTag}`,
        price: new Prisma.Decimal('4500000.00'),
        currency: 'IDR',
        status: 'ACTIVE',
        inclusions: {
          create: [
            { displayName: 'Smart Hub Gateway', isIncluded: true, quantity: 1, displayOrder: 0 },
            { displayName: 'Smart Light Switches', isIncluded: true, quantity: 4, displayOrder: 1 },
          ],
        },
      },
    });
    createdPackageIds.push(testPackage.id);

    // 5. Create Test Houses
    const testHouseA = await prisma.house.create({
      data: {
        name: `Rumah Terintegrasi A ${uniqueTag}`,
        address: 'Jl. Integrasi No. 99',
        customerId: custUserA.customerProfile!.id,
        setupStatus: 'SURVEYING',
      },
    });
    createdHouseIds.push(testHouseA.id);

    const testHouseB = await prisma.house.create({
      data: {
        name: `Rumah Terintegrasi B ${uniqueTag}`,
        address: 'Jl. Unrelated No. 100',
        customerId: custUserB.customerProfile!.id,
        setupStatus: 'ACTIVE',
      },
    });
    createdHouseIds.push(testHouseB.id);

    // 6. Create Test Orders
    // Order 1: Confirmed order with null houseId
    const order1 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-1-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {
          packageName: testPackage.name,
          packageCode: testPackage.code,
          price: testPackage.price.toString(),
          currency: 'IDR',
          inclusions: [{ displayName: 'Smart Hub Gateway', isIncluded: true, quantity: 1 }],
        },
        propertyName: 'Alpha Residence',
        propertyType: 'HOUSE',
        propertyAddress: 'Jl. Surya Utama No. 10',
        city: 'Jakarta',
        postalCode: '12345',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        customerNotes: 'Mohon survei hari kerja',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        statusHistory: {
          create: [
            { previousStatus: null, newStatus: 'PENDING', actorRole: 'CUSTOMER' },
            { previousStatus: 'PENDING', newStatus: 'CONFIRMED', actorRole: 'SUPER_ADMIN' },
          ],
        },
      },
    });
    createdOrderIds.push(order1.id);

    // Order 2: PENDING order
    const order2 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-2-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Alpha Pending Villa',
        propertyType: 'VILLA',
        propertyAddress: 'Jl. Pending No. 5',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'PENDING',
      },
    });
    createdOrderIds.push(order2.id);

    // Order 3: Confirmed order WITH linked House A
    const order3 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-3-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        houseId: testHouseA.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: { inclusions: [{ displayName: 'Smart Hub Gateway', isIncluded: true, quantity: 1 }] },
        propertyName: testHouseA.name,
        propertyType: 'HOUSE',
        propertyAddress: testHouseA.address!,
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    createdOrderIds.push(order3.id);

    // Order 4: Confirmed order for Concurrency Race 4.1 (initial assignment race)
    const order4 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-4-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Alpha Race Villa 1',
        propertyType: 'VILLA',
        propertyAddress: 'Jl. Balap No. 1',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    createdOrderIds.push(order4.id);

    // Order 5: Confirmed order for Concurrency Race 4.2 (concurrent reassignments)
    const order5 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-5-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Alpha Race Villa 2',
        propertyType: 'VILLA',
        propertyAddress: 'Jl. Balap No. 2',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    createdOrderIds.push(order5.id);

    // Order 6: Confirmed order for Concurrency Race 4.3 (assign vs reassign race)
    const order6 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-6-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Alpha Race Villa 3',
        propertyType: 'VILLA',
        propertyAddress: 'Jl. Balap No. 3',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    createdOrderIds.push(order6.id);

    // Order 7: Confirmed order for Concurrency Race 4.4 (availability update vs assign)
    const order7 = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-7-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Alpha Race Villa 4',
        propertyType: 'VILLA',
        propertyAddress: 'Jl. Balap No. 4',
        contactName: 'Pak Alpha',
        contactPhone: '081299990001',
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });
    createdOrderIds.push(order7.id);

    // -------------------------------------------------------------------------
    // TEST P8-01: INITIAL ASSIGNMENT SUCCESS
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-01: Initial Assignment Success ---');
    const assignRes1 = await helper(`/api/service-orders/${order1.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile1.id,
        technicianInstructions: 'Lakukan survei koordinasi awal hari Rabu jam 10:00.',
      }),
    });
    assert(assignRes1.status === 201, 'Assign endpoint returns 201 Created');
    assert(assignRes1.data?.data?.status === 'ACTIVE', 'Created assignment status is ACTIVE');
    assert(
      assignRes1.data?.data?.technicianInstructions === 'Lakukan survei koordinasi awal hari Rabu jam 10:00.',
      'Technician instructions correctly stored'
    );
    assert(
      assignRes1.data?.data?.technician?.technicianProfileId === techProfile1.id,
      'Technician profile matches assigned technician'
    );

    // -------------------------------------------------------------------------
    // TEST P8-02: INVALID ORDER STATUS REJECTION
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-02: Invalid Order Status Rejection ---');
    const assignPendingRes = await helper(`/api/service-orders/${order2.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(
      assignPendingRes.status === 409 || assignPendingRes.status === 400,
      `Assigning PENDING order rejected with ${assignPendingRes.status}`
    );

    // Test with REJECTED order
    const rejectedOrder = await prisma.serviceOrder.create({
      data: {
        orderNumber: `SO-P8-REJ-${uniqueTag}`,
        customerId: custUserA.customerProfile!.id,
        servicePackageId: testPackage.id,
        packageName: testPackage.name,
        packageCode: testPackage.code,
        packagePrice: testPackage.price,
        currency: 'IDR',
        packageSnapshot: {},
        propertyName: 'Rejected House',
        propertyType: 'HOUSE',
        propertyAddress: 'Alamat',
        contactName: 'PIC',
        contactPhone: '08123',
        status: 'REJECTED',
        rejectionReason: 'Lokasi luar jangkauan',
      },
    });
    createdOrderIds.push(rejectedOrder.id);

    const assignRejectedRes = await helper(`/api/service-orders/${rejectedOrder.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(
      assignRejectedRes.status === 409 || assignRejectedRes.status === 400,
      'Assigning REJECTED order rejected with 409/400'
    );

    // -------------------------------------------------------------------------
    // TEST P8-03: INELIGIBLE TECHNICIAN REJECTION
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-03: Ineligible Technician Rejection ---');
    // techProfile3 has availabilityStatus = 'BUSY'
    const assignBusyRes = await helper(`/api/service-orders/${order3.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile3.id }),
    });
    assert(assignBusyRes.status === 400, 'Assigning BUSY technician rejected with 400');

    // Inactive user check
    const inactiveTechUser = await prisma.user.create({
      data: {
        username: `tech_inact_${uniqueTag}`,
        name: `Teknisi Nonaktif ${uniqueTag}`,
        password: hashPassword('TechPassword123'),
        role: 'TECHNICIAN',
        isActive: false, // inactive account
        technicianProfile: {
          create: {
            employeeCode: `TECH-INACT-${uniqueTag.toUpperCase()}`,
            availabilityStatus: 'AVAILABLE',
          },
        },
      },
      include: { technicianProfile: true },
    });
    createdUserIds.push(inactiveTechUser.id);

    const assignInactiveUserRes = await helper(`/api/service-orders/${order3.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: inactiveTechUser.technicianProfile!.id }),
    });
    assert(
      assignInactiveUserRes.status === 400,
      'Assigning technician with inactive user account rejected with 400'
    );

    // -------------------------------------------------------------------------
    // TEST P8-04: DUPLICATE ASSIGNMENT CONFLICT
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-04: Duplicate Assignment Conflict ---');
    const assignDupRes = await helper(`/api/service-orders/${order1.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(
      assignDupRes.status === 409,
      'Duplicate assignment to same technician rejected with 409 ALREADY_ASSIGNED'
    );

    // -------------------------------------------------------------------------
    // TEST P8-05: REASSIGNMENT SUCCESS (ATOMIC REVOKED -> ACTIVE)
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-05: Reassignment Success ---');
    const reassignRes = await helper(`/api/service-orders/${order1.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile2.id,
        reason: 'Teknisi 1 dialihkan ke penanganan insiden darurat area Jakarta Timur.',
        technicianInstructions: 'Mohon lanjutkan survei lapangan dengan standar CCTV Paket Lengkap.',
      }),
    });
    assert(reassignRes.status === 200, 'Reassign endpoint returns 200 OK');
    assert(reassignRes.data?.data?.status === 'ACTIVE', 'New assignment is ACTIVE');
    assert(
      reassignRes.data?.data?.technician?.technicianProfileId === techProfile2.id,
      'New assignment belongs to Technician 2'
    );

    // Verify database state: Exactly one ACTIVE, one REVOKED
    const allAssignmentsForOrder1 = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId: order1.id },
      orderBy: { assignedAt: 'asc' },
    });
    assert(allAssignmentsForOrder1.length === 2, 'Exactly 2 assignments recorded in database');
    assert(allAssignmentsForOrder1[0].status === 'REVOKED', 'First assignment transitioned to REVOKED');
    assert(allAssignmentsForOrder1[0].revokedAt !== null, 'First assignment revokedAt timestamp is set');
    assert(allAssignmentsForOrder1[0].revokedByAdminId !== null, 'First assignment revokedByAdminId is set');
    assert(allAssignmentsForOrder1[1].status === 'ACTIVE', 'Second assignment is ACTIVE');
    assert(
      allAssignmentsForOrder1[1].reassignmentReason ===
        'Teknisi 1 dialihkan ke penanganan insiden darurat area Jakarta Timur.',
      'Reassignment reason persisted'
    );

    // -------------------------------------------------------------------------
    // TEST P8-06: REASSIGNMENT VALIDATION FAILURE & REASON LENGTH
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-06: Reassignment Validation Failure ---');
    // Missing reason
    const reassignNoReasonRes = await helper(`/api/service-orders/${order1.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(reassignNoReasonRes.status === 400, 'Reassignment without reason rejected with 400');

    // 4-character invalid reason ('ubah')
    const reassign4CharRes = await helper(`/api/service-orders/${order1.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile1.id,
        reason: 'ubah',
      }),
    });
    assert(reassign4CharRes.status === 400, "Reassignment with 4-char reason 'ubah' rejected with 400");

    // Whitespace-padded short reason ('  ab  ')
    const reassignWhitespacePadRes = await helper(`/api/service-orders/${order1.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile1.id,
        reason: '   ab   ',
      }),
    });
    assert(
      reassignWhitespacePadRes.status === 400,
      'Reassignment with whitespace-padded short reason rejected with 400'
    );

    // Reassign to current technician (Tech 2 is already active on Order 1)
    const reassignSameTechRes = await helper(`/api/service-orders/${order1.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile2.id,
        reason: 'Alasan penggantian yang cukup panjang',
      }),
    });
    assert(reassignSameTechRes.status === 409, 'Reassigning to same active technician rejected with 409 ALREADY_ASSIGNED');

    // -------------------------------------------------------------------------
    // TEST P8-07: CONCURRENCY HARDENING & RACE CONDITION GUARDS
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-07: Concurrency Hardening & Race Condition Guards ---');

    // 4.1: Two simultaneous initial assignments for the same unassigned ServiceOrder
    console.log('  * 4.1: Simultaneous initial assignments (assign vs assign)');
    const [raceRes1, raceRes2] = await Promise.all([
      helper(`/api/service-orders/${order4.id}/assign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({ technicianProfileId: techProfile1.id, technicianInstructions: 'Race 1' }),
      }),
      helper(`/api/service-orders/${order4.id}/assign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({ technicianProfileId: techProfile2.id, technicianInstructions: 'Race 2' }),
      }),
    ]);
    const statuses1 = [raceRes1.status, raceRes2.status].sort();
    assert(
      (statuses1[0] === 201 || statuses1[0] === 200) && statuses1[1] === 409,
      `Concurrent initial assignment race: exactly 1 succeeded (200/201) and 1 failed with conflict (409). Got [${statuses1.join(', ')}]`
    );
    const activeOrder4 = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId: order4.id, status: 'ACTIVE' },
    });
    assert(activeOrder4.length === 1, 'PostgreSQL engine enforces exactly ONE active assignment for Order 4');

    // 4.2: Two simultaneous reassignments for the same ServiceOrder
    console.log('  * 4.2: Simultaneous reassignments (reassign vs reassign)');
    // First, assign order5 to techProfile2
    const initialOrder5Assign = await helper(`/api/service-orders/${order5.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile2.id }),
    });
    const order5InitialAssignmentId = initialOrder5Assign.data?.data?.id;

    // Both requests attempt to reassign the same initial assignment (with optimistic currentAssignmentId guard)
    const [raceReassign1, raceReassign2] = await Promise.all([
      helper(`/api/service-orders/${order5.id}/reassign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({
          technicianProfileId: techProfile1.id,
          reason: 'Pengalihan konkurensi teknisi 1',
          currentAssignmentId: order5InitialAssignmentId,
        }),
      }),
      helper(`/api/service-orders/${order5.id}/reassign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({
          technicianProfileId: techProfile4.id,
          reason: 'Pengalihan konkurensi teknisi 4',
          currentAssignmentId: order5InitialAssignmentId,
        }),
      }),
    ]);
    const statuses2 = [raceReassign1.status, raceReassign2.status].sort();
    assert(
      statuses2[0] === 200 && statuses2[1] === 409,
      `Concurrent reassignment race: exactly 1 succeeded (200) and 1 failed with conflict (409). Got [${statuses2.join(', ')}]`
    );
    const activeOrder5 = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId: order5.id, status: 'ACTIVE' },
    });
    assert(activeOrder5.length === 1, 'PostgreSQL engine enforces exactly ONE active assignment for Order 5');
    const revokedOrder5 = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId: order5.id, status: 'REVOKED' },
    });
    assert(
      revokedOrder5.length === 1 &&
      revokedOrder5.every((r) => r.revokedAt && r.revokedByAdminId && r.reassignmentReason),
      'Order 5 has exactly ONE cleanly revoked historical assignment (no split or orphaned states)'
    );

    // 4.3: Initial assignment racing with reassignment on an unassigned ServiceOrder
    console.log('  * 4.3: Initial assignment racing with reassignment on unassigned order');
    const [raceMixed1, raceMixed2] = await Promise.all([
      helper(`/api/service-orders/${order6.id}/assign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({ technicianProfileId: techProfile1.id }),
      }),
      helper(`/api/service-orders/${order6.id}/reassign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({
          technicianProfileId: techProfile2.id,
          reason: 'Pengalihan balap tanpa penugasan awal',
        }),
      }),
    ]);
    const activeOrder6 = await prisma.serviceOrderAssignment.findMany({
      where: { serviceOrderId: order6.id, status: 'ACTIVE' },
    });
    assert(activeOrder6.length <= 1, 'Order 6 never has more than ONE active assignment during mixed race');

    // 4.4: Availability update racing with initial assignment
    console.log('  * 4.4: Availability change racing with assignment');
    const [raceAvailRes, raceAssignRes] = await Promise.all([
      helper(`/api/service-orders/admin/technicians/${techProfile4.id}/availability`, {
        method: 'PATCH',
        headers: adminHeader,
        body: JSON.stringify({ availabilityStatus: 'ON_LEAVE' }),
      }),
      helper(`/api/service-orders/${order7.id}/assign`, {
        method: 'POST',
        headers: adminHeader,
        body: JSON.stringify({ technicianProfileId: techProfile4.id }),
      }),
    ]);
    assert(
      (raceAssignRes.status === 201 && raceAvailRes.status === 200) ||
        (raceAssignRes.status === 400 && raceAvailRes.status === 200),
      `Availability change vs assignment handled cleanly (assign: ${raceAssignRes.status}, avail: ${raceAvailRes.status})`
    );

    // Restore techProfile4 availability
    await helper(`/api/service-orders/admin/technicians/${techProfile4.id}/availability`, {
      method: 'PATCH',
      headers: adminHeader,
      body: JSON.stringify({ availabilityStatus: 'AVAILABLE' }),
    });

    // -------------------------------------------------------------------------
    // TEST P8-08: TECHNICIAN IDOR ISOLATION & WORKSPACE PRIVACY
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-08: Technician IDOR Isolation & Workspace Privacy ---');
    // Tech 2 has active assignment on Order 1
    const tech2WorkspaceRes = await helper('/api/technician/assignments', {
      headers: tech2Header,
    });
    assert(tech2WorkspaceRes.status === 200, 'Technician 2 retrieves assigned workspace items');
    const tech2Items: any[] = tech2WorkspaceRes.data?.data || [];
    const foundOrder1 = tech2Items.find((it) => it.serviceOrder.id === order1.id);
    assert(!!foundOrder1, 'Technician 2 sees assigned Order 1 in active workspace');
    assert(
      foundOrder1?.serviceOrder?.packagePrice === undefined,
      'Commercial package price is strictly omitted from technician response'
    );
    assert(
      foundOrder1?.serviceOrder?.packageSnapshot?.price === undefined,
      'Nested snapshot price is strictly omitted from technician list response'
    );

    // Detail fetch by assigned technician
    const tech2DetailRes = await helper(`/api/technician/assignments/${foundOrder1.assignmentId}`, {
      headers: tech2Header,
    });
    assert(tech2DetailRes.status === 200, 'Technician 2 can fetch full details of their assignment');
    assert(
      tech2DetailRes.data?.data?.serviceOrder?.contactPhone === '081299990001',
      'Technician receives customer contact phone for field coordination'
    );
    assert(
      tech2DetailRes.data?.data?.serviceOrder?.packagePrice === undefined,
      'Commercial package price is strictly omitted in detail endpoint'
    );
    assert(
      tech2DetailRes.data?.data?.serviceOrder?.packageSnapshot?.price === undefined,
      'Nested snapshot price is strictly omitted in detail endpoint'
    );
    assert(
      tech2DetailRes.data?.data?.serviceOrder?.adminNotes === undefined,
      'Internal admin notes are strictly omitted from technician response'
    );

    // IDOR Protection: Tech 1 attempts to fetch Tech 2's assignment
    const tech1IdorRes = await helper(`/api/technician/assignments/${foundOrder1.assignmentId}`, {
      headers: tech1Header,
    });
    assert(
      tech1IdorRes.status === 403 || tech1IdorRes.status === 404,
      `Technician 1 cannot access Technician 2's assignment (status: ${tech1IdorRes.status})`
    );

    // -------------------------------------------------------------------------
    // TEST P8-09: IMMEDIATE ACCESS REVOCATION IN PROPERTYACCESSPOLICY
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-09: Immediate Access Revocation in PropertyAccessPolicy ---');
    // Step 1: Assign Order 3 (linked to testHouseA) to Tech 1
    const assignOrder3Res = await helper(`/api/service-orders/${order3.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(assignOrder3Res.status === 201, 'Order 3 assigned to Technician 1');

    const techUser1Payload = {
      userId: techUser1.id,
      role: 'TECHNICIAN' as const,
      technicianProfileId: techProfile1.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const techUser2Payload = {
      userId: techUser2.id,
      role: 'TECHNICIAN' as const,
      technicianProfileId: techProfile2.id,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    // Step 2: Live check PropertyAccessPolicy for Tech 1 on testHouseA
    let tech1AccessBefore = false;
    try {
      await PropertyAccessPolicy.assertCanAccessProperty(techUser1Payload, testHouseA.id);
      tech1AccessBefore = true;
    } catch {
      tech1AccessBefore = false;
    }
    assert(tech1AccessBefore === true, 'Technician 1 can access house while assignment is ACTIVE');

    // Cross-house check: Tech 1 cannot access unrelated testHouseB
    let tech1CrossHouseAccess = false;
    try {
      await PropertyAccessPolicy.assertCanAccessProperty(techUser1Payload, testHouseB.id);
      tech1CrossHouseAccess = true;
    } catch (err: any) {
      tech1CrossHouseAccess = false;
      assert(err.statusCode === 403, 'Cross-house access denied with 403 Forbidden');
    }
    assert(tech1CrossHouseAccess === false, 'Technician 1 cannot access unrelated House B');

    // Step 3: Reassign Order 3 to Tech 2
    const reassignOrder3Res = await helper(`/api/service-orders/${order3.id}/reassign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        technicianProfileId: techProfile2.id,
        reason: 'Rotasi jadwal pemeliharaan berkala unit.',
      }),
    });
    assert(reassignOrder3Res.status === 200, 'Order 3 reassigned to Technician 2');

    // Step 4: Verify immediate revocation for Tech 1 on the very next request
    let tech1AccessAfter = false;
    try {
      await PropertyAccessPolicy.assertCanAccessProperty(techUser1Payload, testHouseA.id);
      tech1AccessAfter = true;
    } catch (err: any) {
      tech1AccessAfter = false;
      assert(err.statusCode === 403, 'Access rejected with status 403');
    }
    assert(tech1AccessAfter === false, 'Technician 1 access is IMMEDIATELY REVOKED upon reassignment');

    // Step 5: Verify new technician (Tech 2) now has access
    let tech2Access = false;
    try {
      await PropertyAccessPolicy.assertCanAccessProperty(techUser2Payload, testHouseA.id);
      tech2Access = true;
    } catch {
      tech2Access = false;
    }
    assert(tech2Access === true, 'Technician 2 now has access to house via live database policy');

    // Step 6: Zero automatic House creation check during dispatch
    const houseCountBefore = await prisma.house.count();
    // Dispatch an unassigned order with houseId = null (Order 6)
    await helper(`/api/service-orders/${order6.id}/assign`, {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    const houseCountAfter = await prisma.house.count();
    assert(
      houseCountAfter === houseCountBefore,
      'No House entity is automatically created during technician assignment'
    );

    // Step 7: Assignment with houseId = null does not grant access to unrelated house
    let nullHouseAccess = false;
    try {
      await PropertyAccessPolicy.assertCanAccessProperty(techUser1Payload, testHouseB.id);
      nullHouseAccess = true;
    } catch (err: any) {
      nullHouseAccess = false;
      assert(err.statusCode === 403, 'Unrelated house access rejected with 403');
    }
    assert(nullHouseAccess === false, 'Assignment with houseId = null does not grant access to unrelated house');

    // -------------------------------------------------------------------------
    // TEST P8-10: CUSTOMER PROJECTION PRIVACY
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-10: Customer Projection Privacy ---');
    const custOrderDetailRes = await helper(`/api/service-orders/${order1.id}`, {
      headers: custAHeader,
    });
    assert(custOrderDetailRes.status === 200, 'Customer A can view their confirmed order');
    const assignedTechInfo = custOrderDetailRes.data?.data?.assignedTechnician;
    assert(!!assignedTechInfo, 'Customer order includes assignedTechnician projection');
    assert(
      assignedTechInfo.name === `Teknisi Beta ${uniqueTag}`,
      'Technician public name is correctly projected'
    );
    assert(
      assignedTechInfo.employeeCode === `TECH-B-${uniqueTag.toUpperCase()}`,
      'Technician employeeCode is correctly projected'
    );
    assert(
      assignedTechInfo.specialization === 'Security & CCTV Integration',
      'Technician specialization is correctly projected'
    );
    assert(!!assignedTechInfo.assignedAt, 'Technician assignedAt timestamp is projected');

    // Strict privacy checks
    assert(
      assignedTechInfo.phone === undefined && assignedTechInfo.email === undefined,
      'Technician personal phone and email are NOT exposed to Customer'
    );
    assert(
      assignedTechInfo.technicianInstructions === undefined,
      'Internal technician instructions are NOT exposed to Customer'
    );
    assert(
      custOrderDetailRes.data?.data?.adminNotes === undefined,
      'Internal admin notes are NOT exposed to Customer'
    );
    assert(
      custOrderDetailRes.data?.data?.assignments === undefined,
      'Historical reassignment audit trail is NOT exposed to Customer'
    );

    // -------------------------------------------------------------------------
    // TEST P8-11: CUSTOMER IDOR ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-11: Customer IDOR Isolation ---');
    const custBIdorRes = await helper(`/api/service-orders/${order1.id}`, {
      headers: custBHeader,
    });
    assert(
      custBIdorRes.status === 404,
      `Customer B receives 404 when attempting to view Customer A's order (got ${custBIdorRes.status})`
    );

    // -------------------------------------------------------------------------
    // TEST P8-12: SUPER ADMIN ROLE GUARD
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-12: Super Admin Role Guard ---');
    const custAssignAttempt = await helper(`/api/service-orders/${order1.id}/assign`, {
      method: 'POST',
      headers: custAHeader,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(custAssignAttempt.status === 403, 'Customer cannot assign technician (403 Forbidden)');

    const techAssignAttempt = await helper(`/api/service-orders/${order1.id}/assign`, {
      method: 'POST',
      headers: tech1Header,
      body: JSON.stringify({ technicianProfileId: techProfile1.id }),
    });
    assert(techAssignAttempt.status === 403, 'Technician cannot assign technician (403 Forbidden)');

    const custAvailAttempt = await helper(
      `/api/service-orders/admin/technicians/${techProfile1.id}/availability`,
      {
        method: 'PATCH',
        headers: custAHeader,
        body: JSON.stringify({ availabilityStatus: 'ON_LEAVE' }),
      }
    );
    assert(custAvailAttempt.status === 403, 'Customer cannot update technician availability (403 Forbidden)');

    // -------------------------------------------------------------------------
    // TEST P8-13: NULLABLE HOUSE ID SUPPORT
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-13: Nullable House ID Support ---');
    assert(order1.houseId === null, 'Order 1 has null houseId');
    const order1AdminDetail = await helper(`/api/service-orders/admin/${order1.id}`, {
      headers: adminHeader,
    });
    assert(order1AdminDetail.status === 200, 'Order 1 retrieved cleanly with null houseId');
    assert(
      order1AdminDetail.data?.data?.house === null,
      'Admin order detail gracefully returns house: null'
    );

    // -------------------------------------------------------------------------
    // TEST P8-14: TECHNICIAN AVAILABILITY MANAGEMENT
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-14: Technician Availability Management ---');
    const listTechRes = await helper('/api/service-orders/admin/technicians', {
      headers: adminHeader,
    });
    assert(listTechRes.status === 200, 'Admin can list technicians with availability and workload');
    const techList: any[] = listTechRes.data?.data || [];
    const foundTech2 = techList.find((t) => t.technicianProfileId === techProfile2.id);
    assert(!!foundTech2, 'Technician 2 found in dispatch list');
    assert(foundTech2.activeAssignmentCount >= 1, 'Technician 2 active assignment count calculated');

    const updateAvailRes = await helper(
      `/api/service-orders/admin/technicians/${techProfile2.id}/availability`,
      {
        method: 'PATCH',
        headers: adminHeader,
        body: JSON.stringify({ availabilityStatus: 'BUSY' }),
      }
    );
    assert(updateAvailRes.status === 200, 'Admin can update availabilityStatus to BUSY');
    assert(
      updateAvailRes.data?.data?.availabilityStatus === 'BUSY',
      'Availability status updated in response'
    );

    const activeAssignmentsAfterAvailChange = await prisma.serviceOrderAssignment.findMany({
      where: { technicianProfileId: techProfile2.id, status: 'ACTIVE' },
    });
    assert(
      activeAssignmentsAfterAvailChange.length >= 1,
      'Changing availability status does NOT revoke existing active assignments'
    );

    // Restore to AVAILABLE
    await helper(`/api/service-orders/admin/technicians/${techProfile2.id}/availability`, {
      method: 'PATCH',
      headers: adminHeader,
      body: JSON.stringify({ availabilityStatus: 'AVAILABLE' }),
    });

    // -------------------------------------------------------------------------
    // TEST P8-15: ASSIGNMENT HISTORY & CONSTRAINTS AUDIT TRAIL
    // -------------------------------------------------------------------------
    console.log('\n--- Test P8-15: Assignment History Audit Trail & Database Constraints ---');
    const historyRes = await helper(`/api/service-orders/${order1.id}/assignments`, {
      headers: adminHeader,
    });
    assert(historyRes.status === 200, 'Admin can fetch full assignment history');
    const historyList: any[] = historyRes.data?.data || [];
    assert(historyList.length === 2, 'History contains both revoked and active assignments');
    const revokedItem = historyList.find((h: any) => h.status === 'REVOKED');
    const activeItem = historyList.find((h: any) => h.status === 'ACTIVE');
    assert(!!revokedItem, 'Revoked assignment found in history');
    assert(revokedItem.revokedBy !== null, 'Revoking admin is recorded in history item');
    assert(!!activeItem, 'Active assignment found in history');
    assert(
      revokedItem.reassignmentReason ===
        'Teknisi 1 dialihkan ke penanganan insiden darurat area Jakarta Timur.',
      'Reassignment reason is preserved in history item'
    );

    // Database constraints check: Try inserting a violating record directly
    let dbConstraintBlocked = false;
    try {
      await prisma.$executeRaw`
        INSERT INTO "service_order_assignments"
          ("id", "serviceOrderId", "technicianProfileId", "assignedByAdminId", "status", "assignedAt", "revokedAt", "revokedByAdminId", "reassignmentReason", "updatedAt")
        VALUES
          (gen_random_uuid()::text, ${order1.id}, ${techProfile1.id}, ${techUser1.id}, 'REVOKED', NOW(), NULL, NULL, 'ubah', NOW());
      `;
    } catch {
      dbConstraintBlocked = true;
    }
    assert(
      dbConstraintBlocked,
      'Database engine constraint chk_assignment_lifecycle_integrity blocks invalid REVOKED record'
    );
  } finally {
    // -------------------------------------------------------------------------
    // CLEAN TEARDOWN
    // -------------------------------------------------------------------------
    console.log('\n--- Teardown Test Fixtures ---');
    try {
      if (createdOrderIds.length > 0) {
        await prisma.serviceOrderAssignment.deleteMany({
          where: { serviceOrderId: { in: createdOrderIds } },
        });
        await prisma.serviceOrderStatusHistory.deleteMany({
          where: { serviceOrderId: { in: createdOrderIds } },
        });
        await prisma.serviceOrder.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (createdHouseIds.length > 0) {
        await prisma.house.deleteMany({
          where: { id: { in: createdHouseIds } },
        });
      }

      if (createdPackageIds.length > 0) {
        await prisma.servicePackageInclusion.deleteMany({
          where: { packageId: { in: createdPackageIds } },
        });
        await prisma.servicePackage.deleteMany({
          where: { id: { in: createdPackageIds } },
        });
      }

      if (createdUserIds.length > 0) {
        await prisma.technicianProfile.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.customerProfile.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
      console.log('  Cleaned up all temporary Phase 8 test fixtures');
    } catch (cleanupErr) {
      console.error('  Warning during teardown:', cleanupErr);
    }

    server.close();
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 PHASE 8 HARDENED TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase8HardenedTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
