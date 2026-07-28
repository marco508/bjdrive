-- Validation des ajustements de stock : employés valideurs + demandes en attente.

ALTER TABLE "User" ADD COLUMN "staffCanApprove" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "StockRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "StockRequest" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "oldStock" INTEGER NOT NULL,
  "newStock" INTEGER NOT NULL,
  "status" "StockRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StockRequest_storeId_status_idx" ON "StockRequest"("storeId", "status");
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
