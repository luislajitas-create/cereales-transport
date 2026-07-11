import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { AgingService } from "./aging.service";
import { hoyNormalizado } from "./shared/fecha";

function primerDiaDelMes(referencia: Date): Date {
  const d = new Date(referencia);
  d.setDate(1);
  return d;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia/cobranzas")
export class AgingController {
  constructor(private agingService: AgingService) {}

  @Roles("ADMINISTRADOR", "GERENCIA", "FACTURACION")
  @Get("aging")
  async aging(
    @Query("clienteId") clienteId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const hoy = hoyNormalizado();
    const periodoDesde = desde ? new Date(desde) : primerDiaDelMes(hoy);
    const periodoHasta = hasta ? new Date(hasta) : hoy;

    const resultado = await this.agingService.calcular(clienteId, periodoDesde, periodoHasta, hoy);

    return {
      fechaCorte: hoy.toISOString().slice(0, 10),
      periodo: { desde: periodoDesde.toISOString().slice(0, 10), hasta: periodoHasta.toISOString().slice(0, 10) },
      ...resultado,
    };
  }
}
