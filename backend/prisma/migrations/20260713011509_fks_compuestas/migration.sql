-- Bloque 8.1.b.4.3 — Endurecimiento: foreign keys compuestas.
-- Reemplaza las 34 FKs simples entre entidades organizacionales por FKs compuestas
-- (fk, organizacionId) -> (id, organizacionId), usando los @@unique([id, organizacionId])
-- ya existentes en los 13 modelos padre. Garantiza a nivel de base que ninguna relación
-- pueda cruzar organizaciones — un intento de insertar/actualizar una fila con fk de
-- otra organización viola la FK compuesta y falla. onDelete/onUpdate de cada relación
-- se mantiene exactamente igual (CASCADE donde ya era CASCADE, RESTRICT en el resto).
-- Auditoría previa (34 relaciones, dev y producción): cero inconsistencias encontradas.
-- Excepción no cubierta (documentada, decisión ya aprobada): AuditLog.entidad/entidadId
-- es una referencia polimórfica sin FK posible — queda para validación a nivel de
-- aplicación cuando exista ese mecanismo, no es parte de este sub-bloque.

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_choferId_fkey";

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_tipoGastoId_fkey";

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_transportistaId_fkey";

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "AnticipoGasto" DROP CONSTRAINT "AnticipoGasto_viajeId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "Chofer" DROP CONSTRAINT "Chofer_transportistaId_fkey";

-- DropForeignKey
ALTER TABLE "Cobranza" DROP CONSTRAINT "Cobranza_facturaId_fkey";

-- DropForeignKey
ALTER TABLE "Contacto" DROP CONSTRAINT "Contacto_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "FacturaViaje" DROP CONSTRAINT "FacturaViaje_facturaId_fkey";

-- DropForeignKey
ALTER TABLE "FacturaViaje" DROP CONSTRAINT "FacturaViaje_viajeId_fkey";

-- DropForeignKey
ALTER TABLE "HistorialEstadoViaje" DROP CONSTRAINT "HistorialEstadoViaje_usuarioId_fkey";

-- DropForeignKey
ALTER TABLE "HistorialEstadoViaje" DROP CONSTRAINT "HistorialEstadoViaje_viajeId_fkey";

-- DropForeignKey
ALTER TABLE "Liquidacion" DROP CONSTRAINT "Liquidacion_choferId_fkey";

-- DropForeignKey
ALTER TABLE "Liquidacion" DROP CONSTRAINT "Liquidacion_creadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "Liquidacion" DROP CONSTRAINT "Liquidacion_transportistaId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionMovimiento" DROP CONSTRAINT "LiquidacionMovimiento_anticipoGastoId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionMovimiento" DROP CONSTRAINT "LiquidacionMovimiento_liquidacionId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionMovimiento" DROP CONSTRAINT "LiquidacionMovimiento_tipoGastoId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionMovimiento" DROP CONSTRAINT "LiquidacionMovimiento_viajeId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionViaje" DROP CONSTRAINT "LiquidacionViaje_liquidacionId_fkey";

-- DropForeignKey
ALTER TABLE "LiquidacionViaje" DROP CONSTRAINT "LiquidacionViaje_viajeId_fkey";

-- DropForeignKey
ALTER TABLE "Vehiculo" DROP CONSTRAINT "Vehiculo_transportistaId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_acopladoId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_camionId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_cerealId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_choferId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_clienteId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_creadoPorId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_destinoId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_origenId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_productorId_fkey";

-- DropForeignKey
ALTER TABLE "Viaje" DROP CONSTRAINT "Viaje_transportistaId_fkey";

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_clienteId_organizacionId_fkey" FOREIGN KEY ("clienteId", "organizacionId") REFERENCES "Cliente"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chofer" ADD CONSTRAINT "Chofer_transportistaId_organizacionId_fkey" FOREIGN KEY ("transportistaId", "organizacionId") REFERENCES "Transportista"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_transportistaId_organizacionId_fkey" FOREIGN KEY ("transportistaId", "organizacionId") REFERENCES "Transportista"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_cerealId_organizacionId_fkey" FOREIGN KEY ("cerealId", "organizacionId") REFERENCES "Cereal"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_clienteId_organizacionId_fkey" FOREIGN KEY ("clienteId", "organizacionId") REFERENCES "Cliente"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_productorId_organizacionId_fkey" FOREIGN KEY ("productorId", "organizacionId") REFERENCES "Productor"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_transportistaId_organizacionId_fkey" FOREIGN KEY ("transportistaId", "organizacionId") REFERENCES "Transportista"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_choferId_organizacionId_fkey" FOREIGN KEY ("choferId", "organizacionId") REFERENCES "Chofer"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_camionId_organizacionId_fkey" FOREIGN KEY ("camionId", "organizacionId") REFERENCES "Vehiculo"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_acopladoId_organizacionId_fkey" FOREIGN KEY ("acopladoId", "organizacionId") REFERENCES "Vehiculo"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_origenId_organizacionId_fkey" FOREIGN KEY ("origenId", "organizacionId") REFERENCES "Ubicacion"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_destinoId_organizacionId_fkey" FOREIGN KEY ("destinoId", "organizacionId") REFERENCES "Ubicacion"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_creadoPorId_organizacionId_fkey" FOREIGN KEY ("creadoPorId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_viajeId_organizacionId_fkey" FOREIGN KEY ("viajeId", "organizacionId") REFERENCES "Viaje"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_usuarioId_organizacionId_fkey" FOREIGN KEY ("usuarioId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_viajeId_organizacionId_fkey" FOREIGN KEY ("viajeId", "organizacionId") REFERENCES "Viaje"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_choferId_organizacionId_fkey" FOREIGN KEY ("choferId", "organizacionId") REFERENCES "Chofer"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_transportistaId_organizacionId_fkey" FOREIGN KEY ("transportistaId", "organizacionId") REFERENCES "Transportista"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_tipoGastoId_organizacionId_fkey" FOREIGN KEY ("tipoGastoId", "organizacionId") REFERENCES "TipoGasto"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_usuarioId_organizacionId_fkey" FOREIGN KEY ("usuarioId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_transportistaId_organizacionId_fkey" FOREIGN KEY ("transportistaId", "organizacionId") REFERENCES "Transportista"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_choferId_organizacionId_fkey" FOREIGN KEY ("choferId", "organizacionId") REFERENCES "Chofer"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_creadoPorId_organizacionId_fkey" FOREIGN KEY ("creadoPorId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_liquidacionId_organizacionId_fkey" FOREIGN KEY ("liquidacionId", "organizacionId") REFERENCES "Liquidacion"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_viajeId_organizacionId_fkey" FOREIGN KEY ("viajeId", "organizacionId") REFERENCES "Viaje"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_liquidacionId_organizacionId_fkey" FOREIGN KEY ("liquidacionId", "organizacionId") REFERENCES "Liquidacion"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_viajeId_organizacionId_fkey" FOREIGN KEY ("viajeId", "organizacionId") REFERENCES "Viaje"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_tipoGastoId_organizacionId_fkey" FOREIGN KEY ("tipoGastoId", "organizacionId") REFERENCES "TipoGasto"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_anticipoGastoId_organizacionId_fkey" FOREIGN KEY ("anticipoGastoId", "organizacionId") REFERENCES "AnticipoGasto"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_organizacionId_fkey" FOREIGN KEY ("clienteId", "organizacionId") REFERENCES "Cliente"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_facturaId_organizacionId_fkey" FOREIGN KEY ("facturaId", "organizacionId") REFERENCES "Factura"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_viajeId_organizacionId_fkey" FOREIGN KEY ("viajeId", "organizacionId") REFERENCES "Viaje"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranza" ADD CONSTRAINT "Cobranza_facturaId_organizacionId_fkey" FOREIGN KEY ("facturaId", "organizacionId") REFERENCES "Factura"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_organizacionId_fkey" FOREIGN KEY ("usuarioId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

