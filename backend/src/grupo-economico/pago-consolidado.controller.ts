import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PagoConsolidadoService } from "./pago-consolidado.service";
import { CrearPagoConsolidadoDto } from "./dto/crear-pago-consolidado.dto";
import { CancelarPagoConsolidadoDto } from "./dto/cancelar-pago-consolidado.dto";

// Bloque 10.5 — DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md, Decisión 4: corrige la
// suposición del diseño original (sin RolesGuard, por analogía con
// OrganizacionesAccesiblesController) — acá rige el mismo criterio que AccesoGrupoController:
// operación administrativa de grupo, exige ADMINISTRADOR, incluso en los endpoints de solo
// lectura (un pago consolidado, incluso leído, ya expone datos financieros de otra
// organización). La ruta "candidatos" se declara antes que ":pagoId" a propósito — mismo orden
// ya usado en LiquidacionesController, para que "candidatos" nunca se interprete como un id.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("grupo-economico")
export class PagoConsolidadoController {
  constructor(private readonly service: PagoConsolidadoService) {}

  @Roles("ADMINISTRADOR")
  @Get(":id/pagos-consolidados/candidatos")
  candidatos(
    @Param("id") id: string,
    @Query("identidadChoferGrupoId") identidadChoferGrupoId: string,
    @CurrentUser() actor: any,
  ) {
    if (!identidadChoferGrupoId) throw new BadRequestException("identidadChoferGrupoId es obligatorio.");
    return this.service.candidatos(id, identidadChoferGrupoId, actor);
  }

  @Roles("ADMINISTRADOR")
  @Post(":id/pagos-consolidados")
  crear(@Param("id") id: string, @Body() dto: CrearPagoConsolidadoDto, @CurrentUser() actor: any) {
    return this.service.crear(id, dto, actor);
  }

  @Roles("ADMINISTRADOR")
  @Get(":id/pagos-consolidados")
  listar(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.service.listar(id, actor);
  }

  @Roles("ADMINISTRADOR")
  @Get(":id/pagos-consolidados/:pagoId")
  consultar(@Param("id") id: string, @Param("pagoId") pagoId: string, @CurrentUser() actor: any) {
    return this.service.consultar(id, pagoId, actor);
  }

  @Roles("ADMINISTRADOR")
  @Post(":id/pagos-consolidados/:pagoId/preparar")
  preparar(@Param("id") id: string, @Param("pagoId") pagoId: string, @CurrentUser() actor: any) {
    return this.service.preparar(id, pagoId, actor);
  }

  @Roles("ADMINISTRADOR")
  @Post(":id/pagos-consolidados/:pagoId/confirmar")
  confirmar(@Param("id") id: string, @Param("pagoId") pagoId: string, @CurrentUser() actor: any) {
    return this.service.confirmar(id, pagoId, actor);
  }

  @Roles("ADMINISTRADOR")
  @Post(":id/pagos-consolidados/:pagoId/cancelar")
  cancelar(
    @Param("id") id: string,
    @Param("pagoId") pagoId: string,
    @Body() dto: CancelarPagoConsolidadoDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.cancelar(id, pagoId, dto, actor);
  }
}
