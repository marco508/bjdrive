-- Blocage définitif d'une enseigne par le super-admin.
ALTER TYPE "StoreStatus" ADD VALUE IF NOT EXISTS 'BANNED';
