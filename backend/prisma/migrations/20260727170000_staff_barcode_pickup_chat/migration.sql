-- Employés d'enseigne, code-barres produits, retrait sur place, messagerie de commande.

-- Rôle employé
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';

-- Mode de réception
CREATE TYPE "Fulfillment" AS ENUM ('DELIVERY', 'PICKUP');
ALTER TABLE "Order" ADD COLUMN "fulfillment" "Fulfillment" NOT NULL DEFAULT 'DELIVERY';

-- Rattachement d'un employé à son enseigne
ALTER TABLE "User" ADD COLUMN "staffStoreId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_staffStoreId_fkey"
  FOREIGN KEY ("staffStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Code-barres interne à l'enseigne
ALTER TABLE "Product" ADD COLUMN "barcode" TEXT;
CREATE UNIQUE INDEX "Product_storeId_barcode_key" ON "Product"("storeId", "barcode");

-- Messagerie par commande
CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderRole" "Role" NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_orderId_createdAt_idx" ON "Message"("orderId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
