-- CreateEnum
CREATE TYPE "EstadoSolicitudCombustible" AS ENUM ('BORRADOR', 'SOLICITADO', 'AUTORIZADO', 'RECHAZADO', 'MODIFICADO', 'ENVIADO', 'RECIBIDO', 'LIQUIDADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoCuentaCorriente" AS ENUM ('ACTIVA', 'SALDADA', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "TipoMetodoPago" AS ENUM ('TRANSFERENCIA', 'CHEQUE', 'EFECTIVO', 'TARJETA_CREDITO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoMovimientoCuenta" AS ENUM ('COMPRA', 'PAGO', 'AJUSTE', 'DEVOLUCION');

-- CreateTable EstacionServicio
CREATE TABLE "EstacionServicio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "domicilio" TEXT,
    "telefonoContacto" TEXT,
    "contactoNombre" TEXT,
    "numeroClientePYME" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstacionServicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable SolicitudCombustible
CREATE TABLE "SolicitudCombustible" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "choferId" TEXT NOT NULL,
    "viajeId" TEXT,
    "estacionId" TEXT,
    "cantidadSolicitada" DOUBLE PRECISION NOT NULL,
    "cantidadRecibida" DOUBLE PRECISION,
    "estado" "EstadoSolicitudCombustible" NOT NULL DEFAULT 'BORRADOR',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaSolicitud" TIMESTAMP(3),
    "fechaAutorizacion" TIMESTAMP(3),
    "fechaEnvio" TIMESTAMP(3),
    "fechaRecepcion" TIMESTAMP(3),
    "fechaLiquidacion" TIMESTAMP(3),
    "observaciones" TEXT,
    "motivoRechazo" TEXT,
    "autorizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitudCombustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable LiquidacionCombustible
CREATE TABLE "LiquidacionCombustible" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "liquidacionId" TEXT,
    "importeLiquidado" DOUBLE PRECISION NOT NULL,
    "fechaLiquidacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiquidacionCombustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable CuentaCorrienteEstacion
CREATE TABLE "CuentaCorrienteEstacion" (
    "id" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "saldoActual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoPendiente" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado" "EstadoCuentaCorriente" NOT NULL DEFAULT 'ACTIVA',
    "ultimaActualizacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,

    CONSTRAINT "CuentaCorrienteEstacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable MovimientoCuentaCorriente
CREATE TABLE "MovimientoCuentaCorriente" (
    "id" TEXT NOT NULL,
    "cuentaCorrienteId" TEXT NOT NULL,
    "tipoMovimiento" "TipoMovimientoCuenta" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "referencia" TEXT,
    "observacion" TEXT,

    CONSTRAINT "MovimientoCuentaCorriente_pkey" PRIMARY KEY ("id")
);

-- CreateTable PagoEstacion
CREATE TABLE "PagoEstacion" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "estacionId" TEXT NOT NULL,
    "cuentaCorrienteId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "importePago" DOUBLE PRECISION NOT NULL,
    "metodoPago" "TipoMetodoPago" NOT NULL,
    "numeroComprobante" TEXT,
    "descripcion" TEXT,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoEstacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReconciliacionCombustible
CREATE TABLE "ReconciliacionCombustible" (
    "id" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "numeroArchivoImportacion" TEXT,
    "fechaImportacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solicitudesEncontradas" INTEGER NOT NULL DEFAULT 0,
    "solicitudesReconciliadas" INTEGER NOT NULL DEFAULT 0,
    "solicitudesConDiscrepancia" INTEGER NOT NULL DEFAULT 0,
    "archivoOriginal" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliacionCombustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable ImportacionCombustible
CREATE TABLE "ImportacionCombustible" (
    "id" TEXT NOT NULL,
    "estacionId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "tipoArchivo" TEXT NOT NULL,
    "contenidoBase64" TEXT,
    "datosExtraidos" TEXT,
    "procesada" BOOLEAN NOT NULL DEFAULT false,
    "fechaProcesamiento" TIMESTAMP(3),
    "errorProcesamiento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacionCombustible_pkey" PRIMARY KEY ("id")
);

-- CreateTable ConsumoCombustibleEstadistica
CREATE TABLE "ConsumoCombustibleEstadistica" (
    "id" TEXT NOT NULL,
    "choferId" TEXT,
    "estacionId" TEXT,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "cantidadTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importeTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "numeroTransacciones" INTEGER NOT NULL DEFAULT 0,
    "promedioPorTransaccion" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsumoCombustibleEstadistica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for EstacionServicio
CREATE INDEX "EstacionServicio_activo_idx" ON "EstacionServicio"("activo");

-- CreateIndex for SolicitudCombustible
CREATE UNIQUE INDEX "SolicitudCombustible_numero_key" ON "SolicitudCombustible"("numero");
CREATE INDEX "SolicitudCombustible_choferId_idx" ON "SolicitudCombustible"("choferId");
CREATE INDEX "SolicitudCombustible_viajeId_idx" ON "SolicitudCombustible"("viajeId");
CREATE INDEX "SolicitudCombustible_estacionId_idx" ON "SolicitudCombustible"("estacionId");
CREATE INDEX "SolicitudCombustible_estado_idx" ON "SolicitudCombustible"("estado");
CREATE INDEX "SolicitudCombustible_fechaSolicitud_idx" ON "SolicitudCombustible"("fechaSolicitud");

-- CreateIndex for LiquidacionCombustible
CREATE UNIQUE INDEX "LiquidacionCombustible_solicitudId_key" ON "LiquidacionCombustible"("solicitudId");
CREATE INDEX "LiquidacionCombustible_liquidacionId_idx" ON "LiquidacionCombustible"("liquidacionId");

-- CreateIndex for CuentaCorrienteEstacion
CREATE UNIQUE INDEX "CuentaCorrienteEstacion_estacionId_key" ON "CuentaCorrienteEstacion"("estacionId");

-- CreateIndex for MovimientoCuentaCorriente
CREATE INDEX "MovimientoCuentaCorriente_cuentaCorrienteId_idx" ON "MovimientoCuentaCorriente"("cuentaCorrienteId");
CREATE INDEX "MovimientoCuentaCorriente_fecha_idx" ON "MovimientoCuentaCorriente"("fecha");

-- CreateIndex for PagoEstacion
CREATE UNIQUE INDEX "PagoEstacion_numero_key" ON "PagoEstacion"("numero");
CREATE INDEX "PagoEstacion_estacionId_idx" ON "PagoEstacion"("estacionId");
CREATE INDEX "PagoEstacion_fecha_idx" ON "PagoEstacion"("fecha");

-- CreateIndex for ReconciliacionCombustible
CREATE INDEX "ReconciliacionCombustible_estacionId_idx" ON "ReconciliacionCombustible"("estacionId");
CREATE INDEX "ReconciliacionCombustible_fechaImportacion_idx" ON "ReconciliacionCombustible"("fechaImportacion");

-- CreateIndex for ImportacionCombustible
CREATE INDEX "ImportacionCombustible_estacionId_idx" ON "ImportacionCombustible"("estacionId");
CREATE INDEX "ImportacionCombustible_procesada_idx" ON "ImportacionCombustible"("procesada");

-- CreateIndex for ConsumoCombustibleEstadistica
CREATE INDEX "ConsumoCombustibleEstadistica_choferId_idx" ON "ConsumoCombustibleEstadistica"("choferId");
CREATE INDEX "ConsumoCombustibleEstadistica_estacionId_idx" ON "ConsumoCombustibleEstadistica"("estacionId");
CREATE INDEX "ConsumoCombustibleEstadistica_mes_ano_idx" ON "ConsumoCombustibleEstadistica"("mes", "ano");

-- AddForeignKey constraints
ALTER TABLE "SolicitudCombustible" ADD CONSTRAINT "SolicitudCombustible_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SolicitudCombustible" ADD CONSTRAINT "SolicitudCombustible_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitudCombustible" ADD CONSTRAINT "SolicitudCombustible_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiquidacionCombustible" ADD CONSTRAINT "LiquidacionCombustible_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SolicitudCombustible"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiquidacionCombustible" ADD CONSTRAINT "LiquidacionCombustible_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CuentaCorrienteEstacion" ADD CONSTRAINT "CuentaCorrienteEstacion_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MovimientoCuentaCorriente" ADD CONSTRAINT "MovimientoCuentaCorriente_cuentaCorrienteId_fkey" FOREIGN KEY ("cuentaCorrienteId") REFERENCES "CuentaCorrienteEstacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PagoEstacion" ADD CONSTRAINT "PagoEstacion_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PagoEstacion" ADD CONSTRAINT "PagoEstacion_cuentaCorrienteId_fkey" FOREIGN KEY ("cuentaCorrienteId") REFERENCES "CuentaCorrienteEstacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReconciliacionCombustible" ADD CONSTRAINT "ReconciliacionCombustible_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportacionCombustible" ADD CONSTRAINT "ImportacionCombustible_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumoCombustibleEstadistica" ADD CONSTRAINT "ConsumoCombustibleEstadistica_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsumoCombustibleEstadistica" ADD CONSTRAINT "ConsumoCombustibleEstadistica_estacionId_fkey" FOREIGN KEY ("estacionId") REFERENCES "EstacionServicio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
