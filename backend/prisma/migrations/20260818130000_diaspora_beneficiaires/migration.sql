-- Module diaspora : commander pour un proche au Bénin.

-- Destinataire de la commande (si différent du client) + suivi public sans compte.
ALTER TABLE "Order" ADD COLUMN "recipientName" TEXT;
ALTER TABLE "Order" ADD COLUMN "recipientPhone" TEXT;
ALTER TABLE "Order" ADD COLUMN "publicToken" TEXT;
CREATE UNIQUE INDEX "Order_publicToken_key" ON "Order"("publicToken");

-- Proches enregistrés par un client (réutilisables d'une commande à l'autre).
CREATE TABLE "Beneficiary" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "phone"     TEXT NOT NULL,
  "address"   TEXT,
  "lat"       DOUBLE PRECISION NOT NULL,
  "lng"       DOUBLE PRECISION NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Beneficiary_clientId_idx" ON "Beneficiary"("clientId");
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
