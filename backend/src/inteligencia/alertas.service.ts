import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { obtenerFacturasEntrada } from "./aging.service";
import { obtenerViajesEntrada } from "./rentabilidad.service";
import { calcularAging } from "./reportes/aging.calc";
import { calcularRentabilidad } from "./reportes/rentabilidad.calc";
import { calcularAlertas, ResultadoAlertas, AnticipoEntrada, ViajeEstadoEntrada } from "./alertas/alertas.calc";
import { hoyNormalizado } from "./shared/fecha";

// Extraído de AlertasController (Bloque 7.3.4) — mismo comportamiento, mismas consultas.
// Devuelve el catálogo COMPLETO sin filtrar por rol: el filtrado es una decisión de
// autorización, no de cálculo, y queda en cada controller que consume este servicio
// (AlertasController filtra; DashboardEjecutivoController no filtra porque solo
// ADMINISTRADOR/GERENCIA lo consumen, y esos dos roles ya ven las nueve categorías).

// Bloque 7.3.4.1 — el fetch + mapeo de Factura y de Viaje ya no está inline acá: reutiliza
// obtenerFacturasEntrada()/obtenerViajesEntrada(), las mismas funciones que usan
// AgingService/RentabilidadService (regla 8, BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md). Se
// llaman sin `orderBy` a propósito, igual que antes: acá no importa el orden de fetch.
@Injectable()
export class AlertasService {
  constructor(private prisma: PrismaService) {}

  async calcular(): Promise<ResultadoAlertas> {
    const hoy = hoyNormalizado();

    const [entradaFacturas, entradaViajes, anticipos, viajesEnCurso] = await Promise.all([
      // Mismo filtro de vigencia que AgingService (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 6).
      obtenerFacturasEntrada(this.prisma, { estado: { not: "ANULADO" } }),
      // Mismo filtro que RentabilidadService, sin acotar por período: las alertas necesitan
      // ver un viaje incompleto sin importar hace cuánto se descargó.
      obtenerViajesEntrada(this.prisma, { estado: "DESCARGADO" }),
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

    // Aging se llama sin período real (alertas no lo necesitan) — se pasa `hoy` en ambos
    // extremos porque DSO no se usa ni se expone acá.
    const aging = calcularAging(entradaFacturas, hoy, hoy, hoy);
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
