import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { calcularAging, FacturaEntrada } from "./reportes/aging.calc";
import { calcularRentabilidad, ViajeEntrada } from "./reportes/rentabilidad.calc";
import { calcularAlertas, ResultadoAlertas, AnticipoEntrada, ViajeEstadoEntrada } from "./reportes/alertas.calc";
import { hoyNormalizado } from "./shared/fecha";

// Extraído de AlertasController (Bloque 7.3.4) — mismo comportamiento, mismas consultas.
// Devuelve el catálogo COMPLETO sin filtrar por rol: el filtrado es una decisión de
// autorización, no de cálculo, y queda en cada controller que consume este servicio
// (AlertasController filtra; DashboardEjecutivoController no filtra porque solo
// ADMINISTRADOR/GERENCIA lo consumen, y esos dos roles ya ven las nueve categorías).
@Injectable()
export class AlertasService {
  constructor(private prisma: PrismaService) {}

  async calcular(): Promise<ResultadoAlertas> {
    const hoy = hoyNormalizado();

    const [facturas, viajesDescargados, anticipos, viajesEnCurso] = await Promise.all([
      // Mismo filtro de vigencia que AgingService (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 6).
      this.prisma.factura.findMany({
        where: { estado: { not: "ANULADO" } },
        select: {
          id: true, numero: true, fecha: true, vencimiento: true, importe: true, estado: true,
          clienteId: true, cliente: { select: { razonSocial: true } },
          cobranzas: { where: { anulada: false }, select: { importe: true, fecha: true } },
        },
      }),
      // Mismo filtro que RentabilidadService, sin acotar por período: las alertas necesitan
      // ver un viaje incompleto sin importar hace cuánto se descargó.
      this.prisma.viaje.findMany({
        where: { estado: "DESCARGADO" },
        select: {
          id: true, numeroViaje: true, fecha: true, clienteId: true, cliente: { select: { razonSocial: true } },
          transportistaId: true, transportista: { select: { razonSocial: true } },
          facturasViaje: {
            where: { factura: { estado: { not: "ANULADO" } } },
            select: { importeViaje: true, factura: { select: { fecha: true } } },
          },
          liquidacionesViaje: {
            where: { liquidacion: { estado: { not: "ANULADA" } } },
            select: { totalViaje: true, liquidacion: { select: { createdAt: true } } },
          },
        },
      }),
      // Primera lectura de AnticipoGasto desde el Motor (sección 6) — duplica, por ahora,
      // el mismo filtro que ya usa DashboardController (dashboard.controller.ts:41-45).
      this.prisma.anticipoGasto.findMany({
        where: { liquidado: false, anulado: false },
        select: { id: true, importe: true, fecha: true, choferId: true, chofer: { select: { nombre: true } } },
      }),
      // Primera lectura de HistorialEstadoViaje desde el Motor.
      this.prisma.viaje.findMany({
        where: { estado: { notIn: ["DESCARGADO", "CANCELADO"] } },
        select: {
          id: true, numeroViaje: true, estado: true,
          historial: { orderBy: { fecha: "desc" }, take: 1, select: { fecha: true } },
        },
      }),
    ]);

    const entradaFacturas: FacturaEntrada[] = facturas.map((f) => ({
      id: f.id, numero: f.numero, fecha: f.fecha, vencimiento: f.vencimiento, importe: f.importe, estado: f.estado,
      clienteId: f.clienteId, cliente: f.cliente.razonSocial,
      cobranzasVigentes: f.cobranzas.map((c) => ({ importe: c.importe, fecha: c.fecha })),
    }));
    // Aging se llama sin período real (alertas no lo necesitan) — se pasa `hoy` en ambos
    // extremos porque DSO no se usa ni se expone acá.
    const aging = calcularAging(entradaFacturas, hoy, hoy, hoy);

    const entradaViajes: ViajeEntrada[] = viajesDescargados.map((v) => ({
      id: v.id, numeroViaje: v.numeroViaje, fecha: v.fecha, clienteId: v.clienteId, cliente: v.cliente.razonSocial,
      transportistaId: v.transportistaId, transportista: v.transportista.razonSocial,
      facturasVigentes: v.facturasViaje.map((fv) => ({ importeViaje: fv.importeViaje, fecha: fv.factura.fecha })),
      liquidacionesVigentes: v.liquidacionesViaje.map((lv) => ({ totalViaje: lv.totalViaje, fecha: lv.liquidacion.createdAt })),
    }));
    const rentabilidad = calcularRentabilidad(entradaViajes);

    const entradaAnticipos: AnticipoEntrada[] = anticipos.map((a) => ({
      id: a.id, importe: a.importe, fecha: a.fecha, choferId: a.choferId, chofer: a.chofer.nombre,
    }));

    const entradaViajesEnCurso: ViajeEstadoEntrada[] = viajesEnCurso
      .filter((v) => v.historial.length > 0)
      .map((v) => ({ id: v.id, numeroViaje: v.numeroViaje, estado: v.estado, fechaUltimoCambio: v.historial[0].fecha }));

    return calcularAlertas(aging, rentabilidad, entradaAnticipos, entradaViajesEnCurso, hoy);
  }
}
