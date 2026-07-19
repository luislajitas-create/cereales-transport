-- CreateEnum
CREATE TYPE "EstadoPagoConsolidadoEnum" AS ENUM ('BORRADOR', 'PREPARADO', 'PROCESANDO', 'CONFIRMADO', 'PARCIAL', 'FALLIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoAplicacionPagoConsolidadoEnum" AS ENUM ('PENDIENTE', 'APLICADA', 'FALLIDA');

-- AlterTable
ALTER TABLE "Liquidacion" ADD COLUMN     "pagoConsolidadoLiquidacionId" TEXT;

-- CreateTable
CREATE TABLE "PagoConsolidado" (
    "id" TEXT NOT NULL,
    "grupoEconomicoId" TEXT NOT NULL,
    "identidadChoferGrupoId" TEXT NOT NULL,
    "estado" "EstadoPagoConsolidadoEnum" NOT NULL DEFAULT 'BORRADOR',
    "totalConsolidado" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "referenciaPago" TEXT,
    "creadoPorId" TEXT,
    "canceladoPorId" TEXT,
    "canceladoMotivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PagoConsolidado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoConsolidadoLiquidacion" (
    "id" TEXT NOT NULL,
    "pagoConsolidadoId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "subtotalNetoPagar" DOUBLE PRECISION NOT NULL,
    "estadoAplicacion" "EstadoAplicacionPagoConsolidadoEnum" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoConsolidadoLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoConsolidado_grupoEconomicoId_idx" ON "PagoConsolidado"("grupoEconomicoId");

-- CreateIndex
CREATE INDEX "PagoConsolidado_identidadChoferGrupoId_idx" ON "PagoConsolidado"("identidadChoferGrupoId");

-- CreateIndex
CREATE INDEX "PagoConsolidadoLiquidacion_pagoConsolidadoId_idx" ON "PagoConsolidadoLiquidacion"("pagoConsolidadoId");

-- CreateIndex
CREATE INDEX "PagoConsolidadoLiquidacion_organizacionId_idx" ON "PagoConsolidadoLiquidacion"("organizacionId");

-- CreateIndex
CREATE INDEX "PagoConsolidadoLiquidacion_liquidacionId_organizacionId_idx" ON "PagoConsolidadoLiquidacion"("liquidacionId", "organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Liquidacion_pagoConsolidadoLiquidacionId_key" ON "Liquidacion"("pagoConsolidadoLiquidacionId");

-- AddForeignKey
ALTER TABLE "PagoConsolidado" ADD CONSTRAINT "PagoConsolidado_grupoEconomicoId_fkey" FOREIGN KEY ("grupoEconomicoId") REFERENCES "GrupoEconomico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoConsolidado" ADD CONSTRAINT "PagoConsolidado_identidadChoferGrupoId_fkey" FOREIGN KEY ("identidadChoferGrupoId") REFERENCES "IdentidadChoferGrupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoConsolidadoLiquidacion" ADD CONSTRAINT "PagoConsolidadoLiquidacion_pagoConsolidadoId_fkey" FOREIGN KEY ("pagoConsolidadoId") REFERENCES "PagoConsolidado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoConsolidadoLiquidacion" ADD CONSTRAINT "PagoConsolidadoLiquidacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoConsolidadoLiquidacion" ADD CONSTRAINT "PagoConsolidadoLiquidacion_liquidacionId_organizacionId_fkey" FOREIGN KEY ("liquidacionId", "organizacionId") REFERENCES "Liquidacion"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_pagoConsolidadoLiquidacionId_fkey" FOREIGN KEY ("pagoConsolidadoLiquidacionId") REFERENCES "PagoConsolidadoLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

