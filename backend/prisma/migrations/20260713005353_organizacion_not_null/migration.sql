-- Bloque 8.1.b.4.1 — Endurecimiento: obligatoriedad de organizacionId.
-- organizacionId pasa a NOT NULL en las 20 tablas organizacionales. Las FKs simples
-- hacia Organizacion se recrean con ON DELETE RESTRICT ON UPDATE CASCADE (antes ON
-- DELETE SET NULL, incompatible con una columna NOT NULL). No se tocan unicidades,
-- FKs compuestas entre entidades de negocio, ni datos existentes.

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Cereal" DROP CONSTRAINT "Cereal_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Chofer" DROP CONSTRAINT "Chofer_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Cobranza" DROP CONSTRAINT "Cobranza_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Contacto" DROP CONSTRAINT "Contacto_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "FacturaViaje" DROP CONSTRAINT "FacturaViaje_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "HistorialEstadoViaje" DROP CONSTRAINT "HistorialEstadoViaje_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Liquidacion" DROP CONSTRAINT "Liquidacion_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionMovimiento" DROP CONSTRAINT "LiquidacionMovimiento_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionViaje" DROP CONSTRAINT "LiquidacionViaje_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Productor" DROP CONSTRAINT "Productor_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "TipoGasto" DROP CONSTRAINT "TipoGasto_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Transportista" DROP CONSTRAINT "Transportista_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Ubicacion" DROP CONSTRAINT "Ubicacion_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Usuario" DROP CONSTRAINT "Usuario_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Vehiculo" DROP CONSTRAINT "Vehiculo_organizacionId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_organizacionId_fkey";

-- AlterTable
ALTER TABLE "AnticipoGasto" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Cereal" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Chofer" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Cliente" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Cobranza" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Contacto" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Factura" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "FacturaViaje" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "HistorialEstadoViaje" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Liquidacion" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LiquidacionMovimiento" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "LiquidacionViaje" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Productor" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "TipoGasto" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Transportista" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Ubicacion" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Usuario" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Vehiculo" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Viaje" ALTER COLUMN "organizacionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Productor" ADD CONSTRAINT "Productor_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transportista" ADD CONSTRAINT "Transportista_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chofer" ADD CONSTRAINT "Chofer_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cereal" ADD CONSTRAINT "Cereal_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ubicacion" ADD CONSTRAINT "Ubicacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipoGasto" ADD CONSTRAINT "TipoGasto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranza" ADD CONSTRAINT "Cobranza_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

