-- Anti-fraude : confiance livreurs, remise enseigne→livreur, trace GPS,
-- délai de versement, alerte livraison figée.

ALTER TABLE "AppConfig" ADD COLUMN "trustedDriverDeliveries" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "AppConfig" ADD COLUMN "newDriverMaxOrderTotal" INTEGER NOT NULL DEFAULT 25000;
ALTER TABLE "AppConfig" ADD COLUMN "payoutDelayDays" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "OrderStore" ADD COLUMN "handedOverAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN "stuckNotifiedAt" TIMESTAMP(3);

CREATE TABLE "DeliveryTrack" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeliveryTrack_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryTrack_orderId_at_idx" ON "DeliveryTrack"("orderId", "at");
CREATE INDEX "DeliveryTrack_at_idx" ON "DeliveryTrack"("at");
