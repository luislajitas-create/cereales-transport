import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { RentabilidadService } from "./rentabilidad.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inteligencia")
export class InteligenciaController {
  constructor(private rentabilidadService: RentabilidadService) {}

  @Roles("ADMINISTRADOR", "GERENCIA")
  @Get("rentabilidad")
  async rentabilidad(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
  ) {
    if (!desde || !hasta) {
      throw new BadRequestException("desde y hasta son obligatorios");
    }
    const resultado = await this.rentabilidadService.calcular(new Date(desde), new Date(hasta), clienteId, transportistaId);
    return { periodo: { desde, hasta }, ...resultado };
  }
}
