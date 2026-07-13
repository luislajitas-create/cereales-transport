import { Inject, Injectable } from "@nestjs/common";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { calcularRentabilidad, ViajeEntrada, ResultadoRentabilidad } from "./reportes/rentabilidad.calc";

// Extraído de InteligenciaController (Bloque 7.3.4) para que Dashboard Ejecutivo pueda
// reutilizar el mismo resultado sin consultar Prisma por su cuenta — mismo comportamiento,
// misma consulta, que antes vivía inline en el controller.

// Bloque 7.3.4.1 — fetch + mapeo de Viaje→ViajeEntrada, reutilizado también por
// AlertasService (regla 8, BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md). Filtro de vigencia
// obligatorio (BLOQUE7.3.1_DISENO_RENTABILIDAD.md, sección 4) para cualquier `where` que
// reciba: solo entran filas de FacturaViaje/LiquidacionViaje cuyo documento padre no esté
// anulado — un viaje con Factura o Liquidación anulada y no reemitida no debe aparecer con
// datos, sino en viajesIncompletos (calculado por reportes/rentabilidad.calc.ts). `orderBy`
// es opcional a propósito: RentabilidadService lo necesita, AlertasService no y no debe
// heredarlo.
export async function obtenerViajesEntrada(prisma: OrganizacionPrismaClient, where: any, orderBy?: any): Promise<ViajeEntrada[]> {
  const viajes = await prisma.viaje.findMany({
    where,
    select: {
      id: true,
      numeroViaje: true,
      fecha: true,
      clienteId: true,
      cliente: { select: { razonSocial: true } },
      transportistaId: true,
      transportista: { select: { razonSocial: true } },
      cerealId: true,
      cereal: { select: { nombre: true } },
      origenId: true,
      origen: { select: { nombre: true } },
      destinoId: true,
      destino: { select: { nombre: true } },
      facturasViaje: {
        where: { factura: { estado: { not: "ANULADO" } } },
        select: { importeViaje: true, factura: { select: { fecha: true } } },
      },
      liquidacionesViaje: {
        where: { liquidacion: { estado: { not: "ANULADA" } } },
        select: { totalViaje: true, liquidacion: { select: { createdAt: true } } },
      },
    },
    ...(orderBy ? { orderBy } : {}),
  });

  return viajes.map((v) => ({
    id: v.id,
    numeroViaje: v.numeroViaje,
    fecha: v.fecha,
    clienteId: v.clienteId,
    cliente: v.cliente.razonSocial,
    transportistaId: v.transportistaId,
    transportista: v.transportista.razonSocial,
    cerealId: v.cerealId,
    cereal: v.cereal.nombre,
    origenId: v.origenId,
    origen: v.origen.nombre,
    destinoId: v.destinoId,
    destino: v.destino.nombre,
    facturasVigentes: v.facturasViaje.map((fv) => ({ importeViaje: fv.importeViaje, fecha: fv.factura.fecha })),
    liquidacionesVigentes: v.liquidacionesViaje.map((lv) => ({ totalViaje: lv.totalViaje, fecha: lv.liquidacion.createdAt })),
  }));
}

@Injectable()
export class RentabilidadService {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  async calcular(fechaDesde: Date, fechaHasta: Date, clienteId?: string, transportistaId?: string): Promise<ResultadoRentabilidad> {
    const where: any = {
      estado: "DESCARGADO",
      fecha: { gte: fechaDesde, lte: fechaHasta },
    };
    if (clienteId) where.clienteId = clienteId;
    if (transportistaId) where.transportistaId = transportistaId;

    const entrada = await obtenerViajesEntrada(this.prisma, where, { fecha: "asc" });

    return calcularRentabilidad(entrada);
  }
}
