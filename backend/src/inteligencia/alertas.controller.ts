import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AlertasService } from "./alertas.service";
import { TipoAlerta } from "./alertas/alertas.calc";
import { hoyNormalizado } from "./shared/fecha";

// Filtrado por rol (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 9) — siempre en backend, nunca
// según lo que el cliente HTTP pida. ADMINISTRADOR y GERENCIA ven las nueve categorías.
const TODOS_LOS_TIPOS: TipoAlerta[] = [
  "factura_vencida", "factura_proxima_vencer", "cliente_deuda_vencida", "concentracion_cliente",
  "anticipo_sin_liquidar", "chofer_anticipos_altos",
  "viaje_sin_facturar", "viaje_sin_liquidar", "viaje_estancado",
];

const TIPOS_POR_ROL: Record<string, TipoAlerta[]> = {
  ADMINISTRADOR: TODOS_LOS_TIPOS,
  GERENCIA: TODOS_LOS_TIPOS,
  FACTURACION: ["factura_vencida", "factura_proxima_vencer", "cliente_deuda_vencida", "concentracion_cliente", "viaje_sin_facturar"],
  LIQUIDACIONES: ["anticipo_sin_liquidar", "chofer_anticipos_altos", "viaje_sin_liquidar"],
  OPERACIONES: ["viaje_estancado"],
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia")
export class AlertasController {
  constructor(private alertasService: AlertasService) {}

  @Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION", "LIQUIDACIONES", "OPERACIONES")
  @Get("alertas")
  async alertas(@CurrentUser() user: any) {
    const resultado = await this.alertasService.calcular();

    const tiposPermitidos = TIPOS_POR_ROL[user?.rol] || [];
    const alertasFiltradas = resultado.alertas.filter((a) => tiposPermitidos.includes(a.tipo));

    return {
      fechaCorte: hoyNormalizado().toISOString().slice(0, 10),
      resumen: {
        total: alertasFiltradas.length,
        criticas: alertasFiltradas.filter((a) => a.severidad === "critica").length,
        preventivas: alertasFiltradas.filter((a) => a.severidad === "preventiva").length,
        informativas: alertasFiltradas.filter((a) => a.severidad === "informativa").length,
      },
      alertas: alertasFiltradas,
      viajesRentabilidadIncompleta: resultado.viajesRentabilidadIncompleta,
    };
  }
}
