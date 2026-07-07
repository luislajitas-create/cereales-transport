-- DropIndex
DROP INDEX "FacturaViaje_viajeId_key";

-- CreateIndex
CREATE INDEX "FacturaViaje_viajeId_idx" ON "FacturaViaje"("viajeId");
