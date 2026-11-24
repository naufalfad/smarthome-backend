-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
