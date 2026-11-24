/**
/**
 * PHASE 6: CRITICAL DATA CONSISTENCY AUTOMATED REPRODUCTION & VERIFICATION SUITE
 *
 * Specifically verifies:
 * 1. Activation synchronization: Package activated by Super Admin immediately appears in Customer Catalog.
 * 2. Deactivation synchronization: Package deactivated by Super Admin immediately disappears from Customer Catalog.
 * 3. Package data consistency: All fields (name, price, shortDescription, description, inclusions)
 *    match identically between Super Admin management and Customer Catalog without drift or hardcoded distortion.
 * 4. Cache-Control enforcement: Anti-caching headers on all package endpoints prevent browser staleness.
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

async function runDataConsistencyTests() {
  console.log('===================================================================');
  console.log('🔄 PHASE 6: DATA CONSISTENCY REPRODUCTION & VERIFICATION TESTS');
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
    return {
      status: res.status,
      headers: res.headers,
      data,
    };
  };

  try {
    // -------------------------------------------------------------------------
    // 0. Setup & Authenticate Test Roles
    // -------------------------------------------------------------------------
    console.log('--- 0. Authentication Setup ---');

    const adminLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'admin', password: 'admin123' }),
    });
    const adminToken = adminLogin.data?.data?.token;
    assert(adminLogin.status === 200 && !!adminToken, 'Super Admin login successful');

    const custLogin = await helper('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'customer.a@smarthome.id', password: 'customer123' }),
    });
    const custToken = custLogin.data?.data?.token;
    assert(custLogin.status === 200 && !!custToken, 'Customer A login successful');

    const adminHeader = { Authorization: `Bearer ${adminToken}` };
    const custHeader = { Authorization: `Bearer ${custToken}` };

    // -------------------------------------------------------------------------
    // 1. Anti-Caching Header Enforcement
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Anti-Caching Header Enforcement ---');

    const catalogListRes = await helper('/api/catalog/packages', { headers: custHeader });
    const catalogCacheControl = catalogListRes.headers.get('cache-control') || '';
    assert(
      catalogCacheControl.includes('no-store') || catalogCacheControl.includes('no-cache'),
      `Customer Catalog list has anti-caching headers: '${catalogCacheControl}'`
    );

    const adminListRes = await helper('/api/service-packages', { headers: adminHeader });
    const adminCacheControl = adminListRes.headers.get('cache-control') || '';
    assert(
      adminCacheControl.includes('no-store') || adminCacheControl.includes('no-cache'),
      `Admin Packages list has anti-caching headers: '${adminCacheControl}'`
    );

    // -------------------------------------------------------------------------
    // 2. Scenario 1: Super Admin Creates DRAFT -> Customer Catalog Excludes It
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Scenario 1: DRAFT Package Isolation ---');

    const testSlug = `consistency-test-${Date.now()}`;
    const initialPrice = '3499000.50';
    const createRes = await helper('/api/service-packages', {
      method: 'POST',
      headers: adminHeader,
      body: JSON.stringify({
        name: 'Consistency Test Package',
        code: testSlug,
        shortDescription: 'Short description for consistency test',
        description: 'Full comprehensive description for consistency test detailing all aspects.',
        price: initialPrice,
        estimatedDuration: '3-5 Hari Kerja',
        hasPhysicalIot: true,
        hasThreeD: false,
        maxRooms: 10,
        maxDevices: 15,
        includedAutomations: 6,
        inclusions: [
          {
            category: 'PROPERTY_SURVEY',
            displayName: 'Survei Tata Letak Properti',
            description: 'Survei teknis komprehensif lokasi',
            isIncluded: true,
            quantity: 1,
          },
          {
            category: 'FLOOR_PLAN_2D',
            displayName: 'Pemetaan Denah 2D Akurat',
            description: 'Denah interaktif multi-lantai berkalibrasi',
            isIncluded: true,
            quantity: 2,
          },
          {
            category: 'IOT_DEVICE_INSTALLATION',
            displayName: 'Instalasi Saklar Cerdas IoT',
            description: 'Pemasangan unit saklar fisik',
            isIncluded: true,
            quantity: 8,
          },
          {
            category: 'THREE_D_MODEL',
            displayName: 'Model Virtual 3D GLB',
            description: 'Tidak disertakan pada paket standar',
            isIncluded: false,
          },
        ],
      }),
    });

    assert(createRes.status === 201, 'Super Admin creates test package in DRAFT status (201)');
    const createdPkgId = createRes.data?.data?.id;
    assert(!!createdPkgId, `Created package ID: ${createdPkgId}`);
    assert(createRes.data?.data?.status === 'DRAFT', 'Package created with initial status DRAFT');

    // Customer catalog should NOT contain this package
    const custCatalogAfterDraft = await helper('/api/catalog/packages', { headers: custHeader });
    const inCatalogDraft = custCatalogAfterDraft.data?.data?.some((p: any) => p.id === createdPkgId);
    assert(!inCatalogDraft, 'Customer catalog DOES NOT include DRAFT package');

    // Direct detail query by customer should return 404
    const custDetailDraft = await helper(`/api/catalog/packages/${createdPkgId}`, { headers: custHeader });
    assert(custDetailDraft.status === 404, 'Customer query for DRAFT package returns 404 Not Found');

    // -------------------------------------------------------------------------
    // 3. Scenario 2: Activation Synchronization (Super Admin Activates -> Customer Sees It)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Scenario 2: Activation Synchronization ---');

    const activateRes = await helper(`/api/service-packages/${createdPkgId}/activate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(activateRes.status === 200, 'Super Admin activates package (200)');
    assert(activateRes.data?.data?.status === 'ACTIVE', 'Package status updated to ACTIVE in DB');

    // Customer catalog query immediately after activation
    const custCatalogAfterActive = await helper('/api/catalog/packages', { headers: custHeader });
    const activePkgInCust = custCatalogAfterActive.data?.data?.find((p: any) => p.id === createdPkgId);
    assert(!!activePkgInCust, 'Package activated by Super Admin IMMEDIATELY appears in Customer Catalog');

    // Direct detail query by customer should now succeed (200)
    const custDetailActive = await helper(`/api/catalog/packages/${createdPkgId}`, { headers: custHeader });
    assert(custDetailActive.status === 200, 'Customer query for ACTIVATED package returns 200 OK');

    // -------------------------------------------------------------------------
    // 4. Scenario 3: Data Consistency Verification (Field-by-Field Check)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Scenario 3: Data Consistency Verification ---');

    const adminPkgDetail = await helper(`/api/service-packages/${createdPkgId}`, { headers: adminHeader });
    const adminData = adminPkgDetail.data?.data;
    const custData = custDetailActive.data?.data;

    assert(adminData.name === custData.name, `Name matches: '${adminData.name}' === '${custData.name}'`);
    assert(adminData.code === custData.code, `Code matches: '${adminData.code}' === '${custData.code}'`);
    assert(
      adminData.price === custData.price,
      `Price decimal string matches: '${adminData.price}' === '${custData.price}'`
    );
    assert(
      adminData.formattedPrice === custData.formattedPrice,
      `Formatted price matches: '${adminData.formattedPrice}' === '${custData.formattedPrice}'`
    );
    assert(
      adminData.shortDescription === custData.shortDescription,
      'Short description matches exactly between Admin and Customer'
    );
    assert(
      adminData.description === custData.description,
      'Full description matches exactly between Admin and Customer'
    );
    assert(
      adminData.hasPhysicalIot === custData.hasPhysicalIot,
      `hasPhysicalIot matches: ${adminData.hasPhysicalIot} === ${custData.hasPhysicalIot}`
    );
    assert(
      adminData.hasThreeD === custData.hasThreeD,
      `hasThreeD matches: ${adminData.hasThreeD} === ${custData.hasThreeD}`
    );
    assert(
      adminData.maxRooms === custData.maxRooms,
      `maxRooms matches: ${adminData.maxRooms} === ${custData.maxRooms}`
    );
    assert(
      adminData.maxDevices === custData.maxDevices,
      `maxDevices matches: ${adminData.maxDevices} === ${custData.maxDevices}`
    );
    assert(
      adminData.includedAutomations === custData.includedAutomations,
      `includedAutomations matches: ${adminData.includedAutomations} === ${custData.includedAutomations}`
    );

    // Inclusions consistency
    assert(
      adminData.inclusions?.length === custData.inclusions?.length,
      `Inclusions count matches: ${adminData.inclusions?.length} === ${custData.inclusions?.length}`
    );

    let allInclusionsMatch = true;
    for (let i = 0; i < adminData.inclusions.length; i++) {
      const aInc = adminData.inclusions[i];
      const cInc = custData.inclusions[i];
      if (
        aInc.displayName !== cInc.displayName ||
        aInc.category !== cInc.category ||
        aInc.isIncluded !== cInc.isIncluded ||
        aInc.quantity !== cInc.quantity
      ) {
        allInclusionsMatch = false;
        console.error('Inclusion mismatch at index', i, { admin: aInc, customer: cInc });
      }
    }
    assert(allInclusionsMatch, 'All inclusions match identically in order, name, category, quantity, and status');

    // -------------------------------------------------------------------------
    // 5. Scenario 4: Update Synchronization (Super Admin Updates Details -> Customer Sees Changes)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Scenario 4: Update Synchronization ---');

    const updatedPrice = '4850000.75';
    const updatedName = 'Consistency Test Package (Updated Edition)';
    const updateRes = await helper(`/api/service-packages/${createdPkgId}`, {
      method: 'PUT',
      headers: adminHeader,
      body: JSON.stringify({
        name: updatedName,
        shortDescription: 'Updated short description for consistency verification',
        description: 'Updated comprehensive description with new parameters and inclusions.',
        price: updatedPrice,
        estimatedDuration: '5-7 Hari Kerja',
        maxRooms: 12,
        maxDevices: 20,
        inclusions: [
          {
            category: 'PROPERTY_SURVEY',
            displayName: 'Survei Tata Letak Properti (Updated)',
            isIncluded: true,
            quantity: 1,
          },
          {
            category: 'FLOOR_PLAN_2D',
            displayName: 'Pemetaan Denah 2D Akurat Multi-Lantai',
            isIncluded: true,
            quantity: 3,
          },
          {
            category: 'TRAINING_AND_HANDOVER',
            displayName: 'Pelatihan & Serah Terima Resmi',
            isIncluded: true,
          },
        ],
      }),
    });

    assert(updateRes.status === 200, 'Super Admin updates package details and inclusions (200)');

    // Customer catalog should immediately reflect updated data
    const custDetailUpdated = await helper(`/api/catalog/packages/${createdPkgId}`, { headers: custHeader });
    const cDataUp = custDetailUpdated.data?.data;

    assert(cDataUp.name === updatedName, `Customer catalog reflects updated name: '${cDataUp.name}'`);
    assert(cDataUp.price === updatedPrice, `Customer catalog reflects updated price: '${cDataUp.price}'`);
    assert(
      cDataUp.shortDescription === 'Updated short description for consistency verification',
      'Customer catalog reflects updated shortDescription'
    );
    assert(cDataUp.maxRooms === 12, 'Customer catalog reflects updated maxRooms: 12');
    assert(cDataUp.inclusions?.length === 3, `Customer catalog reflects updated inclusions count: 3`);
    assert(
      cDataUp.inclusions?.[2]?.displayName === 'Pelatihan & Serah Terima Resmi',
      'Customer catalog reflects newly added inclusion'
    );

    // -------------------------------------------------------------------------
    // 6. Scenario 5: Deactivation Synchronization (Super Admin Deactivates -> Package Disappears)
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Scenario 5: Deactivation Synchronization ---');

    const deactivateRes = await helper(`/api/service-packages/${createdPkgId}/deactivate`, {
      method: 'PATCH',
      headers: adminHeader,
    });
    assert(deactivateRes.status === 200, 'Super Admin deactivates package (200)');
    assert(deactivateRes.data?.data?.status === 'INACTIVE', 'Package status updated to INACTIVE in DB');

    // Customer catalog should immediately exclude the deactivated package
    const custCatalogAfterDeactive = await helper('/api/catalog/packages', { headers: custHeader });
    const inCatalogDeactive = custCatalogAfterDeactive.data?.data?.some((p: any) => p.id === createdPkgId);
    assert(
      !inCatalogDeactive,
      'Package deactivated by Super Admin IMMEDIATELY disappears from Customer Catalog listing'
    );

    // Customer direct query should immediately return 404
    const custDetailDeactive = await helper(`/api/catalog/packages/${createdPkgId}`, { headers: custHeader });
    assert(
      custDetailDeactive.status === 404,
      'Direct customer detail query for deactivated package immediately returns 404 Not Found'
    );

    // -------------------------------------------------------------------------
    // 7. Cleanup Test Package
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Cleanup Test Package ---');
    // Delete test package cleanly to leave DB pristine
    await prisma.servicePackageInclusion.deleteMany({ where: { packageId: createdPkgId } });
    await prisma.servicePackage.delete({ where: { id: createdPkgId } });
    console.log('  Cleaned up temporary test package.');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    failed++;
  } finally {
    server.close();
    await disconnectDatabase();
  }

  console.log('\n===================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDataConsistencyTests();
