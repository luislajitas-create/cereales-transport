-- DropIndex
DROP INDEX "LiquidacionViaje_viajeId_key";

-- CreateIndex
CREATE INDEX "LiquidacionViaje_viajeId_idx" ON "LiquidacionViaje"("viajeId");

