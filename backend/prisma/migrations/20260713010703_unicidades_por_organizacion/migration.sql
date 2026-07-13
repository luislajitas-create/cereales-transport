-- Bloque 8.1.b.4.2 — Endurecimiento: unicidades por organización.
-- Reemplaza 10 unicidades globales por unicidades compuestas (organizacionId, campo):
-- Cliente.cuit, Productor.cuit, Transportista.cuit, Chofer.dni, Chofer.cuil,
-- Vehiculo.patente, Cereal.nombre, TipoGasto.nombre, Viaje.ctg, Factura.numero.
-- Usuario.email se mantiene único global (decisión aprobada: un usuario, una org, el
-- login resuelve la organización sin selector). Verificado antes de generar esta
-- migración: cero colisiones dentro de la misma organización para los 10 campos.

-- DropIndex
DROP INDEX "Cereal_nombre_key";

-- DropIndex
DROP INDEX "Chofer_cuil_key";

-- DropIndex
DROP INDEX "Chofer_dni_key";

-- DropIndex
DROP INDEX "Cliente_cuit_key";

-- DropIndex
DROP INDEX "Factura_numero_key";

-- DropIndex
DROP INDEX "Productor_cuit_key";

-- DropIndex
DROP INDEX "TipoGasto_nombre_key";

-- DropIndex
DROP INDEX "Transportista_cuit_key";

-- DropIndex
DROP INDEX "Vehiculo_patente_key";

-- DropIndex
DROP INDEX "Viaje_ctg_key";

-- CreateIndex
CREATE UNIQUE INDEX "Cereal_organizacionId_nombre_key" ON "Cereal"("organizacionId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Chofer_organizacionId_dni_key" ON "Chofer"("organizacionId", "dni");

-- CreateIndex
CREATE UNIQUE INDEX "Chofer_organizacionId_cuil_key" ON "Chofer"("organizacionId", "cuil");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_organizacionId_cuit_key" ON "Cliente"("organizacionId", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_organizacionId_numero_key" ON "Factura"("organizacionId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Productor_organizacionId_cuit_key" ON "Productor"("organizacionId", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "TipoGasto_organizacionId_nombre_key" ON "TipoGasto"("organizacionId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Transportista_organizacionId_cuit_key" ON "Transportista"("organizacionId", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_organizacionId_patente_key" ON "Vehiculo"("organizacionId", "patente");

-- CreateIndex
CREATE UNIQUE INDEX "Viaje_organizacionId_ctg_key" ON "Viaje"("organizacionId", "ctg");

