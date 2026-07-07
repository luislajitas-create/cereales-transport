-- AlterTable
ALTER TABLE "LiquidacionMovimiento" ADD COLUMN     "anticipoGastoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Chofer_dni_key" ON "Chofer"("dni");

-- CreateIndex
CREATE INDEX "LiquidacionMovimiento_anticipoGastoId_idx" ON "LiquidacionMovimiento"("anticipoGastoId");

-- CreateIndex
CREATE UNIQUE INDEX "Productor_cuit_key" ON "Productor"("cuit");

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_anticipoGastoId_fkey" FOREIGN KEY ("anticipoGastoId") REFERENCES "AnticipoGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

