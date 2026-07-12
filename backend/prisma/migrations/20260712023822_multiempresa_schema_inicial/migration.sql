-- AlterTable
ALTER TABLE "AnticipoGasto" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Cereal" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Chofer" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Cobranza" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Contacto" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "FacturaViaje" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "HistorialEstadoViaje" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Liquidacion" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "LiquidacionMovimiento" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "LiquidacionViaje" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Productor" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "TipoGasto" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Transportista" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Ubicacion" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Vehiculo" ADD COLUMN     "organizacionId" TEXT;

-- AlterTable
ALTER TABLE "Viaje" ADD COLUMN     "organizacionId" TEXT;

-- CreateTable
CREATE TABLE "Organizacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnticipoGasto_organizacionId_idx" ON "AnticipoGasto"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "AnticipoGasto_id_organizacionId_key" ON "AnticipoGasto"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "AuditLog_organizacionId_idx" ON "AuditLog"("organizacionId");

-- CreateIndex
CREATE INDEX "Cereal_organizacionId_idx" ON "Cereal"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Cereal_id_organizacionId_key" ON "Cereal"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Chofer_organizacionId_idx" ON "Chofer"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Chofer_id_organizacionId_key" ON "Chofer"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Cliente_organizacionId_idx" ON "Cliente"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_id_organizacionId_key" ON "Cliente"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Cobranza_organizacionId_idx" ON "Cobranza"("organizacionId");

-- CreateIndex
CREATE INDEX "Contacto_organizacionId_idx" ON "Contacto"("organizacionId");

-- CreateIndex
CREATE INDEX "Factura_organizacionId_idx" ON "Factura"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_id_organizacionId_key" ON "Factura"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "FacturaViaje_organizacionId_idx" ON "FacturaViaje"("organizacionId");

-- CreateIndex
CREATE INDEX "HistorialEstadoViaje_organizacionId_idx" ON "HistorialEstadoViaje"("organizacionId");

-- CreateIndex
CREATE INDEX "Liquidacion_organizacionId_idx" ON "Liquidacion"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_id_organizacionId_key" ON "Liquidacion"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "LiquidacionMovimiento_organizacionId_idx" ON "LiquidacionMovimiento"("organizacionId");

-- CreateIndex
CREATE INDEX "LiquidacionViaje_organizacionId_idx" ON "LiquidacionViaje"("organizacionId");

-- CreateIndex
CREATE INDEX "Productor_organizacionId_idx" ON "Productor"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Productor_id_organizacionId_key" ON "Productor"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "TipoGasto_organizacionId_idx" ON "TipoGasto"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "TipoGasto_id_organizacionId_key" ON "TipoGasto"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Transportista_organizacionId_idx" ON "Transportista"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transportista_id_organizacionId_key" ON "Transportista"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Ubicacion_organizacionId_idx" ON "Ubicacion"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ubicacion_id_organizacionId_key" ON "Ubicacion"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Usuario_organizacionId_idx" ON "Usuario"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_id_organizacionId_key" ON "Usuario"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Vehiculo_organizacionId_idx" ON "Vehiculo"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_id_organizacionId_key" ON "Vehiculo"("id", "organizacionId");

-- CreateIndex
CREATE INDEX "Viaje_organizacionId_idx" ON "Viaje"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Viaje_id_organizacionId_key" ON "Viaje"("id", "organizacionId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Productor" ADD CONSTRAINT "Productor_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transportista" ADD CONSTRAINT "Transportista_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chofer" ADD CONSTRAINT "Chofer_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cereal" ADD CONSTRAINT "Cereal_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipoGasto" ADD CONSTRAINT "TipoGasto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranza" ADD CONSTRAINT "Cobranza_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

