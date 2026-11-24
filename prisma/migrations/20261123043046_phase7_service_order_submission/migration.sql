-- CreateSequence
CREATE SEQUENCE IF NOT EXISTS service_order_number_seq START WITH 1 INCREMENT BY 1;

-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "service_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "servicePackageId" TEXT,
    "packageSnapshot" JSONB NOT NULL,
    "packageName" TEXT NOT NULL,
    "packageCode" TEXT NOT NULL,
    "packagePrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "propertyName" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL DEFAULT 'HOUSE',
    "propertyAddress" TEXT NOT NULL,
    "city" TEXT,
    "postalCode" TEXT,
    "approximateAreaM2" DECIMAL(8,2),
    "estimatedRooms" INTEGER,
    "hasPhysicalIot" BOOLEAN NOT NULL DEFAULT false,
    "customerNotes" TEXT,
    "houseId" TEXT,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedByAdminId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_order_status_history" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "previousStatus" "ServiceOrderStatus",
    "newStatus" "ServiceOrderStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_orderNumber_key" ON "service_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "service_orders_customerId_idx" ON "service_orders"("customerId");

-- CreateIndex
CREATE INDEX "service_orders_status_idx" ON "service_orders"("status");

-- CreateIndex
CREATE INDEX "service_orders_orderNumber_idx" ON "service_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "service_orders_servicePackageId_idx" ON "service_orders"("servicePackageId");

-- CreateIndex
CREATE INDEX "service_orders_createdAt_idx" ON "service_orders"("createdAt");

-- CreateIndex
CREATE INDEX "service_order_status_history_serviceOrderId_createdAt_idx" ON "service_order_status_history"("serviceOrderId", "createdAt");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_servicePackageId_fkey" FOREIGN KEY ("servicePackageId") REFERENCES "service_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_confirmedByAdminId_fkey" FOREIGN KEY ("confirmedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_rejectedByAdminId_fkey" FOREIGN KEY ("rejectedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_status_history" ADD CONSTRAINT "service_order_status_history_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_order_status_history" ADD CONSTRAINT "service_order_status_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
