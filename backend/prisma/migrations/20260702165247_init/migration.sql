-- CreateEnum
CREATE TYPE "RolNombre" AS ENUM ('ADMINISTRADOR', 'GERENCIA', 'OPERACIONES', 'LIQUIDACIONES', 'FACTURACION', 'LECTURA');

-- CreateEnum
CREATE TYPE "EstadoViajeEnum" AS ENUM ('PENDIENTE', 'ASIGNADO', 'EN_CARGA', 'CARGADO', 'EN_TRANSITO', 'DESCARGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoFacturacionEnum" AS ENUM ('PENDIENTE_DE_FACTURAR', 'FACTURADO', 'COBRADO_PARCIAL', 'COBRADO_TOTAL', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoLiquidacionItemEnum" AS ENUM ('PENDIENTE', 'LIQUIDADO', 'PAGADO');

-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('CAMION', 'ACOPLADO');

-- CreateEnum
CREATE TYPE "TipoUbicacion" AS ENUM ('ACOPIO', 'PLANTA', 'PUERTO', 'CAMPO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoLiquidacion" AS ENUM ('TRANSPORTISTA', 'CHOFER');

-- CreateEnum
CREATE TYPE "EstadoLiquidacionEnum" AS ENUM ('BORRADOR', 'CONFIRMADA', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoFacturaEnum" AS ENUM ('FACTURADO', 'COBRADO_PARCIAL', 'COBRADO_TOTAL', 'ANULADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolNombre" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "condicionesComerciales" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contacto" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,

    CONSTRAINT "Contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Productor" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT,
    "localidad" TEXT,

    CONSTRAINT "Productor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transportista" (
    "id" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "domicilio" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transportista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chofer" (
    "id" TEXT NOT NULL,
    "transportistaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT,
    "cuil" TEXT NOT NULL,
    "licenciaNumero" TEXT,
    "licenciaVencimiento" TIMESTAMP(3),
    "telefono" TEXT,

    CONSTRAINT "Chofer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" TEXT NOT NULL,
    "transportistaId" TEXT NOT NULL,
    "patente" TEXT NOT NULL,
    "marca" TEXT,
    "modelo" TEXT,
    "tipo" "TipoVehiculo" NOT NULL,
    "capacidadKg" DOUBLE PRECISION,
    "vencimientoRto" TIMESTAMP(3),
    "vencimientoSeguro" TIMESTAMP(3),

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cereal" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Cereal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ubicacion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoUbicacion" NOT NULL,
    "localidad" TEXT,

    CONSTRAINT "Ubicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipoGasto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "afectaLiquidacion" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TipoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viaje" (
    "id" TEXT NOT NULL,
    "numeroViaje" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "cartaPorte" TEXT NOT NULL,
    "ctg" TEXT NOT NULL,
    "cerealId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "productorId" TEXT,
    "transportistaId" TEXT NOT NULL,
    "choferId" TEXT NOT NULL,
    "camionId" TEXT NOT NULL,
    "acopladoId" TEXT,
    "origenId" TEXT NOT NULL,
    "destinoId" TEXT NOT NULL,
    "toneladas" DOUBLE PRECISION NOT NULL,
    "tarifaTonelada" DOUBLE PRECISION NOT NULL,
    "importeTotal" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoViajeEnum" NOT NULL DEFAULT 'PENDIENTE',
    "estadoFacturacion" "EstadoFacturacionEnum" NOT NULL DEFAULT 'PENDIENTE_DE_FACTURAR',
    "estadoLiquidacion" "EstadoLiquidacionItemEnum" NOT NULL DEFAULT 'PENDIENTE',
    "observaciones" TEXT,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialEstadoViaje" (
    "id" TEXT NOT NULL,
    "viajeId" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT NOT NULL,
    "usuarioId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialEstadoViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnticipoGasto" (
    "id" TEXT NOT NULL,
    "viajeId" TEXT,
    "choferId" TEXT NOT NULL,
    "transportistaId" TEXT NOT NULL,
    "tipoGastoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "observaciones" TEXT,
    "usuarioId" TEXT,
    "comprobanteUrl" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "anuladoMotivo" TEXT,
    "liquidado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnticipoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoLiquidacion" NOT NULL,
    "transportistaId" TEXT,
    "choferId" TEXT,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoLiquidacionEnum" NOT NULL DEFAULT 'BORRADOR',
    "comisionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBruto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAnticipos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDescuentos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netoPagar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechaPago" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionViaje" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "viajeId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "comisionPct" DOUBLE PRECISION NOT NULL,
    "comisionMonto" DOUBLE PRECISION NOT NULL,
    "totalViaje" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LiquidacionViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiquidacionMovimiento" (
    "id" TEXT NOT NULL,
    "liquidacionId" TEXT NOT NULL,
    "viajeId" TEXT,
    "tipoGastoId" TEXT NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "observacion" TEXT,
    "comprobanteUrl" TEXT,

    CONSTRAINT "LiquidacionMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "vencimiento" TIMESTAMP(3) NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoFacturaEnum" NOT NULL DEFAULT 'FACTURADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaViaje" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "viajeId" TEXT NOT NULL,
    "importeViaje" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FacturaViaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cobranza" (
    "id" TEXT NOT NULL,
    "facturaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "medioPago" TEXT,
    "observacion" TEXT,

    CONSTRAINT "Cobranza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "datosAnteriores" JSONB,
    "datosNuevos" JSONB,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_cuit_key" ON "Cliente"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Transportista_cuit_key" ON "Transportista"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "Chofer_cuil_key" ON "Chofer"("cuil");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_patente_key" ON "Vehiculo"("patente");

-- CreateIndex
CREATE UNIQUE INDEX "Cereal_nombre_key" ON "Cereal"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "TipoGasto_nombre_key" ON "TipoGasto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Viaje_ctg_key" ON "Viaje"("ctg");

-- CreateIndex
CREATE INDEX "Viaje_fecha_idx" ON "Viaje"("fecha");

-- CreateIndex
CREATE INDEX "Viaje_clienteId_idx" ON "Viaje"("clienteId");

-- CreateIndex
CREATE INDEX "Viaje_transportistaId_idx" ON "Viaje"("transportistaId");

-- CreateIndex
CREATE INDEX "Viaje_estado_idx" ON "Viaje"("estado");

-- CreateIndex
CREATE INDEX "HistorialEstadoViaje_viajeId_idx" ON "HistorialEstadoViaje"("viajeId");

-- CreateIndex
CREATE INDEX "AnticipoGasto_choferId_fecha_idx" ON "AnticipoGasto"("choferId", "fecha");

-- CreateIndex
CREATE INDEX "AnticipoGasto_transportistaId_fecha_idx" ON "AnticipoGasto"("transportistaId", "fecha");

-- CreateIndex
CREATE INDEX "Liquidacion_transportistaId_idx" ON "Liquidacion"("transportistaId");

-- CreateIndex
CREATE INDEX "Liquidacion_choferId_idx" ON "Liquidacion"("choferId");

-- CreateIndex
CREATE UNIQUE INDEX "LiquidacionViaje_viajeId_key" ON "LiquidacionViaje"("viajeId");

-- CreateIndex
CREATE INDEX "LiquidacionViaje_liquidacionId_idx" ON "LiquidacionViaje"("liquidacionId");

-- CreateIndex
CREATE INDEX "LiquidacionMovimiento_liquidacionId_idx" ON "LiquidacionMovimiento"("liquidacionId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE INDEX "Factura_clienteId_idx" ON "Factura"("clienteId");

-- CreateIndex
CREATE INDEX "Factura_vencimiento_idx" ON "Factura"("vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaViaje_viajeId_key" ON "FacturaViaje"("viajeId");

-- CreateIndex
CREATE INDEX "FacturaViaje_facturaId_idx" ON "FacturaViaje"("facturaId");

-- CreateIndex
CREATE INDEX "Cobranza_facturaId_idx" ON "Cobranza"("facturaId");

-- CreateIndex
CREATE INDEX "AuditLog_entidad_entidadId_idx" ON "AuditLog"("entidad", "entidadId");

-- AddForeignKey
ALTER TABLE "Contacto" ADD CONSTRAINT "Contacto_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chofer" ADD CONSTRAINT "Chofer_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_cerealId_fkey" FOREIGN KEY ("cerealId") REFERENCES "Cereal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_productorId_fkey" FOREIGN KEY ("productorId") REFERENCES "Productor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_camionId_fkey" FOREIGN KEY ("camionId") REFERENCES "Vehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_acopladoId_fkey" FOREIGN KEY ("acopladoId") REFERENCES "Vehiculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Ubicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viaje" ADD CONSTRAINT "Viaje_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialEstadoViaje" ADD CONSTRAINT "HistorialEstadoViaje_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_tipoGastoId_fkey" FOREIGN KEY ("tipoGastoId") REFERENCES "TipoGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticipoGasto" ADD CONSTRAINT "AnticipoGasto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_transportistaId_fkey" FOREIGN KEY ("transportistaId") REFERENCES "Transportista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionViaje" ADD CONSTRAINT "LiquidacionViaje_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "Liquidacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiquidacionMovimiento" ADD CONSTRAINT "LiquidacionMovimiento_tipoGastoId_fkey" FOREIGN KEY ("tipoGastoId") REFERENCES "TipoGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaViaje" ADD CONSTRAINT "FacturaViaje_viajeId_fkey" FOREIGN KEY ("viajeId") REFERENCES "Viaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cobranza" ADD CONSTRAINT "Cobranza_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
