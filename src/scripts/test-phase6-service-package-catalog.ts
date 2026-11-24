/**
 * PHASE 6 VERIFICATION TEST SUITE
 * Service Package Catalog & Commercial Product Foundation
 *
 * Verifies all Phase 6 security, commercial, and domain rules:
 * 1. Anonymous Access Rejection (401 Unauthorized for all endpoints).
 * 2. Strict Role Authorization:
 *    - Super Admin: full CRUD + lifecycle management.
 *    - Customer: read-only access to ACTIVE catalog packages only; write & admin endpoints strictly 403.
 *    - Technician: strictly 403 Forbidden on both admin and customer catalog endpoints.
 * 3. Customer Catalog Isolation:
 *    - Customer only sees ACTIVE packages.
 *    - DRAFT, INACTIVE, and ARCHIVED packages return 404 or are omitted from listing.
 * 4. Data Integrity & Validation:
 *    - Code / slug validation (lowercase, hyphens, alphanumeric).
 *    - Duplicate code uniqueness enforcement (409 Conflict).
 *    - Price validation (non-negative, numeric, precise decimal representation).
 *    - Atomic inclusion replacement in Prisma transaction.
 * 5. Lifecycle State Machine:
 *    - DRAFT -> ACTIVE -> INACTIVE -> ACTIVE -> ARCHIVED.
 *    - ARCHIVED is terminal (cannot edit or reactivate).
 * 6. Precision & Monetary Formatting:
 *    - PostgreSQL Decimal(12, 2) preserved without floating-point distortion.
 *    - Serialized with numeric value and Indonesian Rupiah formatted string.
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

async function runPhase6Tests() {
  console.log('===================================================================');
  console.log('📦 PHASE 6: SERVICE PACKAGE CATALOG & COMMERCIAL FOUNDATION TESTS');
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
    // 0. Setup & Authenticate Test Roles
    // -------------------------------------------------------------------------
    console.log('--- 0. Authentication Setup ---');

    // Admin
    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin login successful');

    // Customer
    const custLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.a@smarthome.id', password: 'customer123' }),
    });
    const custToken = custLogin.data?.data?.token;
    assert(custLogin.status === 200 && !!custToken, 'Customer A login successful');

    // Technician
    const techLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'technician.x@smarthome.id', password: 'tech123' }),
    });
    const techToken = techLogin.data?.data?.token;
    assert(techLogin.status === 200 && !!techToken, 'Technician X login successful');

    const adminHeader = { Authorization: `Bearer ${adminToken}` };
    const custHeader = { Authorization: `Bearer ${custToken}` };
    const techHeader = { Authorization: `Bearer ${techToken}` };

    // -------------------------------------------------------------------------
    // 1. Anonymous Access Rejection (401 Unauthorized)
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Anonymous Access Security ---');

    const anon1 = await helper('/api/service-packages');
    assert(anon1.status === 401, 'Anon GET /api/service-packages rejected with 401');

    const anon2 = await helper('/api/catalog/packages');
    assert(anon2.status === 401, 'Anon GET /api/catalog/packages rejected with 401');

    const anon3 = await helper('/api/service-packages', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hack Package', code: 'hack-pack', price: 1000 }),
    });
    assert(anon3.status === 401, 'Anon POST /api/service-packages rejected with 401');

    // -------------------------------------------------------------------------
    // 2. Role Authorization Matrix (Customer-Only Catalog Enforcement)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Role-Based Authorization Enforcement ---');

    // Customer trying Admin routes
    const custAdminList = await helper('/api/service-packages', { headers: custHeader });
    assert(custAdminList.status === 403, 'Customer cannot access admin package list (403)');

    const custCreate = await helper('/api/service-packages', {
      method: 'POST',
      headers: custHeader,
      body: JSON.stringify({ name: 'Unauthorized', code: 'unauth-pkg', shortDescription: 'Test', price: '1000000.00' }),
    });
    assert(custCreate.status === 403, 'Customer cannot create package (403)');

    // Technician trying Admin routes & Customer Catalog routes
    const techAdminList = await helper('/api/service-packages', { headers: techHeader });
    assert(techAdminList.status === 403, 'Technician cannot access admin package list (403)');

    const techCatalog = await helper('/api/catalog/packages', { headers: techHeader });
    assert(techCatalog.status === 403, 'Technician cannot access customer catalog list (403)');

    const techCatalogDetail = await helper('/api/catalog/packages/smart-home-essential-iot', { headers: techHeader });
    assert(techCatalogDetail.status === 403, 'Technician cannot access customer catalog detail (403)');

    const techCreate = await helper('/api/service-packages', {
      method: 'POST',
      headers: techHeader,
      body: JSON.stringify({ name: 'Tech Package', code: 'tech-pkg', shortDescription: 'Test', price: '500000.00' }),
    });
    assert(techCreate.status === 403, 'Technician cannot create package (403)');

    // Super Admin trying Customer Catalog routes (Customer-Only enforcement)
    const adminCatalogList = await helper('/api/catalog/packages', { headers: adminHeader });
    assert(adminCatalogList.status === 403, 'Super Admin cannot access customer catalog list (403)');

    const adminCatalogDetail = await helper('/api/catalog/packages/smart-home-essential-iot', { headers: adminHeader });
    assert(adminCatalogDetail.status === 403, 'Super Admin cannot access customer catalog detail (403)');

    // -------------------------------------------------------------------------
    // 3. Super Admin Package Creation & Validation
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Package Creation & Validation (Super Admin) ---');

    // 3a. Invalid code format
    const invalidCodeRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Invalid Code Package',
        code: 'INVALID CODE with spaces',
        shortDescription: 'Invalid code test',
        price: 2500000,
        description: 'Test invalid code',
      }),
    });
    assert(invalidCodeRes.status === 400, 'Creation with invalid code format rejected (400)');

    // 3b. Negative price
    const negativePriceRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Negative Price Package',
        code: 'negative-price-pkg',
        shortDescription: 'Negative price test',
        price: -50000,
        description: 'Test negative price',
      }),
    });
    assert(negativePriceRes.status === 400, 'Creation with negative price rejected (400)');

    // 3c. Valid package creation with precise decimal and structured inclusions
    const testCode = `test-pkg-${Date.now()}`;
    const createRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Test Smart Suite Pro',
        code: testCode,
        shortDescription: 'Solusi lengkap smart home otomatis dengan instalasi onsite',
        price: '4999999.75', // Exact string boundary input
        description: 'Comprehensive smart home package with 2D/3D and IoT devices',
        estimatedDuration: '3-5 hari kerja',
        hasPhysicalIot: true,
        hasThreeD: true,
        maxRooms: 10,
        maxDevices: 25,
        includedAutomations: 8,
        inclusions: [
          {
            category: 'IOT_DEVICE_INSTALLATION',
            displayName: 'Smart Light Switches',
            description: 'Zigbee 3.0 Touch Switches',
            isIncluded: true,
            quantity: 8,
            displayOrder: 1,
          },
          {
            category: 'PROPERTY_SURVEY',
            displayName: 'On-site Survey & Installation',
            description: 'Professional wiring and deployment',
            isIncluded: true,
            quantity: 1,
            displayOrder: 2,
          },
          {
            category: 'THREE_D_MODEL',
            displayName: 'Custom 3D Digital Twin',
            description: 'Full high-poly digital twin',
            isIncluded: false,
            displayOrder: 3,
          },
        ],
      }),
    });

    assert(createRes.status === 201, 'Super Admin creates package with inclusions (201)');
    const createdPkg = createRes.data?.data;
    assert(createdPkg?.code === testCode, 'Created package code matches');
    assert(createdPkg?.status === 'DRAFT', 'Newly created package defaults to DRAFT status');
    assert(typeof createdPkg?.price === 'string' && createdPkg.price === '4999999.75', 'Canonical decimal string "4999999.75" returned in API response');
    assert(typeof createdPkg?.formattedPrice === 'string' && createdPkg.formattedPrice.includes('4.999.999'), 'Serialized Rupiah formatted price correct');
    assert(createdPkg?.inclusions?.length === 3, 'All 3 structured inclusions created');

    const createdPkgId = createdPkg?.id;

    // 3d. Monetary Precision Boundary Tests
    console.log('\n--- 3b. Monetary Precision Boundary Tests ---');

    // 0.00 price
    const zeroPriceRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Zero Price Package',
        code: `zero-pkg-${Date.now()}`,
        shortDescription: 'Zero price boundary test',
        price: '0.00',
      }),
    });
    assert(zeroPriceRes.status === 201, 'Boundary test "0.00" price accepted (201)');
    assert(zeroPriceRes.data?.data?.price === '0.00', 'Canonical decimal string "0.00" returned');
    const zeroPkgId = zeroPriceRes.data?.data?.id;

    // 999999999.99 maximum price
    const maxPriceRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Max Price Package',
        code: `max-pkg-${Date.now()}`,
        shortDescription: 'Max price boundary test',
        price: '999999999.99',
      }),
    });
    assert(maxPriceRes.status === 201, 'Boundary test "999999999.99" max price accepted (201)');
    assert(maxPriceRes.data?.data?.price === '999999999.99', 'Canonical decimal string "999999999.99" returned');
    const maxPkgId = maxPriceRes.data?.data?.id;

    // Negative decimal string
    const negStrRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Neg Str Package',
        code: `neg-pkg-${Date.now()}`,
        shortDescription: 'Negative string test',
        price: '-100.50',
      }),
    });
    assert(negStrRes.status === 400, 'Negative decimal string "-100.50" rejected (400)');

    // Malformed decimal string
    const malformedPriceRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Malformed Price Package',
        code: `mal-pkg-${Date.now()}`,
        shortDescription: 'Malformed price test',
        price: '12.34.56',
      }),
    });
    assert(malformedPriceRes.status === 400, 'Malformed decimal string "12.34.56" rejected (400)');

    // Excessive decimal places (must reject, not silently round)
    const excessiveDecRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Excessive Decimals Package',
        code: `excessive-pkg-${Date.now()}`,
        shortDescription: 'Excessive decimals test',
        price: '4999999.755',
      }),
    });
    assert(excessiveDecRes.status === 400, 'Excessive decimal places "4999999.755" rejected without silent rounding (400)');

    // Value exceeding maximum
    const exceedMaxRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Exceed Max Package',
        code: `exceed-pkg-${Date.now()}`,
        shortDescription: 'Exceed max test',
        price: '1000000000.00',
      }),
    });
    assert(exceedMaxRes.status === 400, 'Price exceeding 999999999.99 rejected (400)');

    // 3e. Physical IoT Default Tests
    console.log('\n--- 3c. Physical IoT Default Tests ---');

    // Case 1: hasPhysicalIot omitted -> defaults to false
    const omittedIotRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Omitted IoT Package',
        code: `omitted-iot-${Date.now()}`,
        shortDescription: 'Omitted hasPhysicalIot test',
        price: '1500000.00',
        // hasPhysicalIot omitted
      }),
    });
    assert(omittedIotRes.status === 201, 'Package with omitted hasPhysicalIot created (201)');
    assert(omittedIotRes.data?.data?.hasPhysicalIot === false, 'Omitted hasPhysicalIot defaults to false');
    const omittedIotId = omittedIotRes.data?.data?.id;

    // Case 2: hasPhysicalIot explicitly false
    const explicitFalseRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Explicit False IoT Package',
        code: `false-iot-${Date.now()}`,
        shortDescription: 'Explicit false hasPhysicalIot test',
        price: '1500000.00',
        hasPhysicalIot: false,
      }),
    });
    assert(explicitFalseRes.status === 201, 'Package with explicit false hasPhysicalIot created (201)');
    assert(explicitFalseRes.data?.data?.hasPhysicalIot === false, 'Explicit hasPhysicalIot false is false');
    const falseIotId = explicitFalseRes.data?.data?.id;

    // Case 3: hasPhysicalIot explicitly true
    const explicitTrueRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Explicit True IoT Package',
        code: `true-iot-${Date.now()}`,
        shortDescription: 'Explicit true hasPhysicalIot test',
        price: '2500000.00',
        hasPhysicalIot: true,
      }),
    });
    assert(explicitTrueRes.status === 201, 'Package with explicit true hasPhysicalIot created (201)');
    assert(explicitTrueRes.data?.data?.hasPhysicalIot === true, 'Explicit hasPhysicalIot true is true');
    const trueIotId = explicitTrueRes.data?.data?.id;

    // Clean up boundary test packages
    for (const bId of [zeroPkgId, maxPkgId, omittedIotId, falseIotId, trueIotId]) {
      if (bId) {
        await prisma.servicePackageInclusion.deleteMany({ where: { packageId: bId } });
        await prisma.servicePackage.delete({ where: { id: bId } });
      }
    }

    // 3f. Duplicate code rejection
    const duplicateRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Duplicate Code Package',
        code: testCode,
        shortDescription: 'Duplicate code test',
        price: 1000000,
      }),
    });
    assert(duplicateRes.status === 409, 'Duplicate package code rejected with 409 Conflict');

    // -------------------------------------------------------------------------
    // 4. Customer Isolation from DRAFT Packages
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Customer Catalog Isolation (DRAFT Hidden) ---');

    // Customer catalog listing
    const custCatalog1 = await helper('/api/catalog/packages', { headers: custHeader });
    assert(custCatalog1.status === 200, 'Customer fetches active catalog (200)');
    const isDraftInCustList = custCatalog1.data?.data?.some((p: any) => p.code === testCode);
    assert(!isDraftInCustList, 'Customer catalog excludes DRAFT package');

    // Customer fetching draft directly by code
    const custGetDraft = await helper(`/api/catalog/packages/${testCode}`, { headers: custHeader });
    assert(custGetDraft.status === 404, 'Customer cannot view DRAFT package detail by code (404)');

    // -------------------------------------------------------------------------
    // 5. Lifecycle State Transitions (DRAFT -> ACTIVE -> INACTIVE -> ARCHIVED)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Lifecycle State Machine Transitions ---');

    // 5a. Activate DRAFT -> ACTIVE
    const activateRes = await helper(`/api/service-packages/${createdPkgId}/activate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(activateRes.status === 200, 'Super Admin activates package (200)');
    assert(activateRes.data?.data?.status === 'ACTIVE', 'Package status is now ACTIVE');

    // 5b. Customer now sees ACTIVE package in catalog
    const custCatalog2 = await helper('/api/catalog/packages', { headers: custHeader });
    const isNowInCustList = custCatalog2.data?.data?.some((p: any) => p.code === testCode);
    assert(isNowInCustList, 'Customer catalog now includes newly ACTIVATED package');

    const custGetActive = await helper(`/api/catalog/packages/${testCode}`, { headers: custHeader });
    assert(custGetActive.status === 200, 'Customer can view ACTIVE package detail by code (200)');
    assert(custGetActive.data?.data?.inclusions?.length === 3, 'Customer detail includes all inclusions');

    // 5c. Deactivate ACTIVE -> INACTIVE
    const deactivateRes = await helper(`/api/service-packages/${createdPkgId}/deactivate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(deactivateRes.status === 200, 'Super Admin deactivates package (200)');
    assert(deactivateRes.data?.data?.status === 'INACTIVE', 'Package status is now INACTIVE');

    // Customer should no longer see it
    const custCatalog3 = await helper('/api/catalog/packages', { headers: custHeader });
    const isInactiveInCustList = custCatalog3.data?.data?.some((p: any) => p.code === testCode);
    assert(!isInactiveInCustList, 'Customer catalog hides INACTIVE package');

    // 5d. Reactivate INACTIVE -> ACTIVE
    const reactivateRes = await helper(`/api/service-packages/${createdPkgId}/activate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(reactivateRes.status === 200, 'Super Admin reactivates INACTIVE package to ACTIVE (200)');
    assert(reactivateRes.data?.data?.status === 'ACTIVE', 'Package status is ACTIVE again');

    // 5e. Archive ACTIVE -> ARCHIVED
    const archiveRes = await helper(`/api/service-packages/${createdPkgId}/archive`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(archiveRes.status === 200, 'Super Admin archives package (200)');
    assert(archiveRes.data?.data?.status === 'ARCHIVED', 'Package status is now ARCHIVED');

    // 5f. ARCHIVED package cannot be reactivated or edited
    const editArchivedRes = await helper(`/api/service-packages/${createdPkgId}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({ name: 'Attempted Edit' }),
    });
    assert(editArchivedRes.status === 400, 'Editing ARCHIVED package is rejected (400)');

    const reactivateArchivedRes = await helper(`/api/service-packages/${createdPkgId}/activate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(reactivateArchivedRes.status === 400, 'Activating ARCHIVED package is rejected (400)');

    // -------------------------------------------------------------------------
    // 6. Inclusions Update & Transaction Atomicity
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Atomic Inclusions Replacement ---');

    // Create another draft package to test update & delete
    const testCode2 = `test-inclusions-${Date.now()}`;
    const create2Res = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Inclusions Test Package',
        code: testCode2,
        shortDescription: 'Inclusions test short description',
        description: 'Inclusions test full description',
        price: 1500000,
        inclusions: [
          { category: 'IOT_DEVICE_CONFIGURATION', displayName: 'Initial Item', isIncluded: true, displayOrder: 1 },
        ],
      }),
    });
    assert(create2Res.status === 201, 'Created second test package');
    const pkg2Id = create2Res.data?.data?.id;

    // Update with completely new inclusions
    const updateRes = await helper(`/api/service-packages/${pkg2Id}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Inclusions Test Package Updated',
        price: 1750000,
        inclusions: [
          { category: 'SMART_HOME_DASHBOARD', displayName: 'Updated Cloud Service', isIncluded: true, displayOrder: 1 },
          { category: 'TRAINING_AND_HANDOVER', displayName: 'Updated 24/7 SLA', isIncluded: true, displayOrder: 2 },
        ],
      }),
    });
    assert(updateRes.status === 200, 'Updated package and replaced inclusions (200)');
    const updatedPkg = updateRes.data?.data;
    assert(updatedPkg?.inclusions?.length === 2, 'Inclusions length matches updated set (2)');
    assert(updatedPkg?.inclusions?.every((inc: any) => inc.displayName.startsWith('Updated')), 'Old inclusions replaced atomically');

    // -------------------------------------------------------------------------
    // 7. Safe Deletion of DRAFT Package
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Safe Deletion ---');

    const deleteRes = await helper(`/api/service-packages/${pkg2Id}`, {
      method: 'DELETE',
      headers: adminHeader,
    });
    assert(deleteRes.status === 200, 'Super Admin can delete DRAFT package (200)');

    // Verify gone from DB
    const getDeleted = await helper(`/api/service-packages/${pkg2Id}`, { headers: adminHeader });
    assert(getDeleted.status === 404, 'Deleted package no longer exists (404)');

    // Clean up createdPkg (ARCHIVED) as well
    if (createdPkgId) {
      await prisma.servicePackageInclusion.deleteMany({ where: { packageId: createdPkgId } });
      await prisma.servicePackage.delete({ where: { id: createdPkgId } });
      console.log('  🧹 Cleaned up temporary test packages');
    }

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    server.close();
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`🏁 PHASE 6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6Tests().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
