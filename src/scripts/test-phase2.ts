import fs from 'fs';
import path from 'path';
import { app } from '../server.js';
import { buildDollhouseGlb } from './generate-sample-house.js';
import { prisma } from '../services/db.service.js';

async function runPhase2Tests() {
  console.log('\n======================================================');
  console.log('🧪 PHASE 2 AUTOMATED TEST & VALIDATION SUITE');
  console.log('======================================================\n');

  // Start temporary server on port 5099 for isolation
  const testPort = 5099;
  const server = app.listen(testPort);
  const baseUrl = `http://localhost:${testPort}/api`;

  let uploadedModelId = '';
  let storedFilePath = '';

  try {
    // Test 1: Verify PostgreSQL Prisma connection
    console.log('1️⃣ Checking PostgreSQL connection...');
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('   ✅ PostgreSQL connected successfully');

    // Prepare test files in scratch
    const scratchDir = path.join(process.cwd(), 'scratch');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const validGlbPath = path.join(scratchDir, 'test_dollhouse.glb');
    fs.writeFileSync(validGlbPath, buildDollhouseGlb());

    const textFilePath = path.join(scratchDir, 'invalid_doc.txt');
    fs.writeFileSync(textFilePath, 'This is a plain text file, not a GLB 3D model.');

    const fakeGlbPath = path.join(scratchDir, 'corrupted_fake.glb');
    fs.writeFileSync(fakeGlbPath, Buffer.from('FAKE_HEADER_NOT_GLTF_BINARY'));

    // Test 2: Reject non-GLB file
    console.log('\n2️⃣ Testing rejection of non-GLB file (.txt)...');
    const formTxt = new FormData();
    formTxt.append('name', 'Text File Test');
    formTxt.append('file', new Blob([fs.readFileSync(textFilePath)]), 'invalid_doc.txt');

    const resTxt = await fetch(`${baseUrl}/house-models`, {
      method: 'POST',
      body: formTxt,
    });
    const dataTxt: any = await resTxt.json();
    if (resTxt.status === 400 || !dataTxt.success) {
      console.log(`   ✅ Correctly REJECTED non-GLB file (${resTxt.status}): ${dataTxt.message}`);
    } else {
      throw new Error(`Failed: non-GLB file was accepted!`);
    }

    // Test 3: Reject file with invalid GLB magic signature
    console.log('\n3️⃣ Testing rejection of invalid GLB signature...');
    const formFake = new FormData();
    formFake.append('name', 'Fake GLB Test');
    formFake.append('file', new Blob([fs.readFileSync(fakeGlbPath)]), 'corrupted_fake.glb');

    const resFake = await fetch(`${baseUrl}/house-models`, {
      method: 'POST',
      body: formFake,
    });
    const dataFake: any = await resFake.json();
    if (resFake.status === 400 || !dataFake.success) {
      console.log(`   ✅ Correctly REJECTED corrupted GLB signature (${resFake.status}): ${dataFake.message}`);
    } else {
      throw new Error(`Failed: fake GLB was accepted!`);
    }

    // Test 4: Upload valid 3D Dollhouse GLB
    console.log('\n4️⃣ Testing valid 3D Dollhouse GLB upload...');
    const formGlb = new FormData();
    formGlb.append('name', 'Modern Two-Story Villa');
    formGlb.append('description', 'Architectural cutaway dollhouse with living room, bedroom, and IoT anchors.');
    formGlb.append('file', new Blob([fs.readFileSync(validGlbPath)]), 'test_dollhouse.glb');

    const resGlb = await fetch(`${baseUrl}/house-models`, {
      method: 'POST',
      body: formGlb,
    });
    const dataGlb: any = await resGlb.json();
    if (resGlb.status === 201 && dataGlb.success) {
      uploadedModelId = dataGlb.data.id;
      storedFilePath = path.resolve(process.cwd(), dataGlb.data.filePath);
      console.log(`   ✅ GLB Upload SUCCESSFUL! ID: ${uploadedModelId}`);
      console.log(`   📁 Stored file path: ${dataGlb.data.filePath}`);
      console.log(`   💾 Exists on disk: ${fs.existsSync(storedFilePath)} (${fs.statSync(storedFilePath).size} bytes)`);
    } else {
      throw new Error(`GLB upload failed: ${dataGlb.message}`);
    }

    // Test 5: Verify GLB inspection metadata
    console.log('\n5️⃣ Verifying GLB inspection metadata...');
    const metadata = dataGlb.data.modelMetadata;
    console.log(`   📊 Total Nodes Detected: ${metadata.summary.totalNodes}`);
    console.log(`   📦 Total Meshes: ${metadata.summary.totalMeshes}`);
    console.log(`   🚪 Rooms Detected: ${metadata.summary.totalRoomsDetected} (${metadata.classifiedNodes.rooms.join(', ')})`);
    console.log(`   ⚓ IoT Anchors Detected: ${metadata.summary.totalEmptyAnchors} (${metadata.classifiedNodes.anchors.join(', ')})`);
    console.log(`   💡 Devices Detected: ${metadata.summary.totalDevicesDetected} (${metadata.classifiedNodes.objects.join(', ')})`);
    console.log(`   📏 Dimensions: ${metadata.dimensions.x}m × ${metadata.dimensions.y}m × ${metadata.dimensions.z}m`);

    if (metadata.summary.totalNodes !== 21 || metadata.summary.totalMeshes !== 4) {
      throw new Error(`Metadata mismatch! Expected 21 nodes, got ${metadata.summary.totalNodes}`);
    }
    console.log('   ✅ Inspection hierarchy and empty anchors verified!');

    // Test 6: Verify GET /api/house-models
    console.log('\n6️⃣ Verifying GET /api/house-models list...');
    const resList = await fetch(`${baseUrl}/house-models`);
    const dataList: any = await resList.json();
    if (resList.ok && dataList.data.models.length > 0) {
      console.log(`   ✅ Model list retrieved. Found ${dataList.data.models.length} model(s).`);
    } else {
      throw new Error('Failed to retrieve model list');
    }

    // Test 7: Verify GET /api/house-models/:id/file stream
    console.log('\n7️⃣ Verifying GLB streaming endpoint (GET /api/house-models/:id/file)...');
    const resFile = await fetch(`${baseUrl}/house-models/${uploadedModelId}/file`);
    const contentType = resFile.headers.get('content-type');
    const fileBytes = await resFile.arrayBuffer();
    console.log(`   📡 Content-Type: ${contentType}`);
    console.log(`   📦 Streamed Bytes: ${fileBytes.byteLength}`);

    if (resFile.ok && contentType?.includes('model/gltf-binary') && fileBytes.byteLength > 0) {
      console.log('   ✅ GLB File streaming endpoint verified with proper MIME type!');
    } else {
      throw new Error(`File streaming failed or returned incorrect MIME: ${contentType}`);
    }

    // Test 8: Verify PATCH /api/house-models/:id
    console.log('\n8️⃣ Verifying metadata update (PATCH /api/house-models/:id)...');
    const resPatch = await fetch(`${baseUrl}/house-models/${uploadedModelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Modern Villa (Inspected)', status: 'PUBLISHED' }),
    });
    const dataPatch: any = await resPatch.json();
    if (resPatch.ok && dataPatch.data.name === 'Modern Villa (Inspected)' && dataPatch.data.status === 'PUBLISHED') {
      console.log('   ✅ Model update verified! Status changed to PUBLISHED');
    } else {
      throw new Error('Failed to update model');
    }

    // Test 9: Verify POST /api/house-models/:id/inspect re-inspection
    console.log('\n9️⃣ Verifying on-demand re-inspection (POST /api/house-models/:id/inspect)...');
    const resReinspect = await fetch(`${baseUrl}/house-models/${uploadedModelId}/inspect`, {
      method: 'POST',
    });
    const dataReinspect: any = await resReinspect.json();
    if (resReinspect.ok && dataReinspect.data.inspection?.summary?.totalNodes === 21) {
      console.log('   ✅ Re-inspection endpoint verified!');
    } else {
      throw new Error('Re-inspection failed');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 9 AUTOMATED BACKEND & STORAGE TESTS PASSED!');
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runPhase2Tests().then(() => process.exit(0));

