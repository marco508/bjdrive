-- Fiabilité : paiements (transaction unique), retours de livraison, comptabilité.

-- Nouveaux statuts de commande : livraison échouée → retour → clôture.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNING';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'FAILED';

-- Échec signalé par le livreur.
ALTER TABLE "Delivery" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "Delivery" ADD COLUMN "failReason" TEXT;

-- L'enseigne confirme le retour de sa part de commande.
ALTER TABLE "OrderStore" ADD COLUMN "returnedAt" TIMESTAMP(3);

-- Une transaction KkiaPay ne peut payer qu'UNE commande.
-- (Nettoyage préalable d'éventuels doublons hérités : on ne garde la référence
--  que sur le paiement le plus ancien.)
UPDATE "Payment" p SET "providerRef" = NULL
WHERE p."providerRef" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Payment" q
  WHERE q."providerRef" = p."providerRef" AND q."createdAt" < p."createdAt"
);
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- Casquette d'un versement (STORE/DRIVER) pour les utilisateurs à double rôle.
ALTER TABLE "Payout" ADD COLUMN "role" TEXT;

-- Expiration des commandes en ligne jamais payées (minutes).
ALTER TABLE "AppConfig" ADD COLUMN "pendingPaymentTtlMin" INTEGER NOT NULL DEFAULT 45;
