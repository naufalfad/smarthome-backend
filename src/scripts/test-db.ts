import { checkDatabaseConnection, prisma } from '../services/db.service.js';
import { config } from '../config/env.js';

async function main() {
  console.log('\n======================================================');
  console.log('🔍 Testing Database Connection via Prisma Client');
  console.log('======================================================');
  console.log(`📡 Target URL: ${config.databaseUrl ? config.databaseUrl.replace(/:[^:@]+@/, ':****@') : '(none provided)'}`);
  console.log('⏳ Connecting...');

  const result = await checkDatabaseConnection();

  if (result.isConnected) {
    console.log('\n✅ Database Connection SUCCESSFUL!');
    console.log(`⏱️  Latency: ${result.latencyMs}ms`);
    console.log('✨ Prisma Client is ready for queries.');
  } else {
    console.log('\n⚠️  Database Connection FAILED (Expected if PostgreSQL is not yet running)');
    console.log(`❌ Reason: ${result.details}`);
    console.log('\n📋 Quick Setup Guide for PostgreSQL:');
    console.log(' 1. Ensure PostgreSQL is installed and running on your system.');
    console.log(' 2. Update DATABASE_URL in backend/.env with your valid credentials:');
    console.log('    DATABASE_URL="postgresql://username:password@localhost:5432/smarthome3d?schema=public"');
    console.log(' 3. Run "npx prisma db push" to create tables.');
    console.log(' 4. Run "npm run test:db" again to verify connectivity.');
  }
  console.log('======================================================\n');

  await prisma.$disconnect();
  process.exit(result.isConnected ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Fatal error during test:', err);
  await prisma.$disconnect();
  process.exit(1);
});

