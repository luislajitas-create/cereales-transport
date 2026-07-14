import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { UpdateOrganizacionDto } from "./dto/update-organizacion.dto";

const SELECT_ORGANIZACION = {
  id: true,
  nombre: true,
  razonSocial: true,
  cuit: true,
  domicilio: true,
  telefono: true,
  email: true,
  zonaHoraria: true,
  moneda: true,
  createdAt: true,
};

// Bloque 9.4 — administración de la organización propia. El id siempre se toma de
// @CurrentUser().organizacionId (derivado del JWT), nunca de un parámetro de la URL o del body:
// no existe forma de leer ni editar otra organización (BLOQUE9_DISENO_ADMINISTRACION.md,
// sección 5). Organizacion no es un modelo organizacional en el sentido de la Prisma Extension
// (no tiene su propio organizacionId) — el aislamiento acá es manual, por where: { id }.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("organizacion")
export class OrganizacionController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  obtener(@CurrentUser() actor: any) {
    return this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: SELECT_ORGANIZACION,
    });
  }

  @Roles("ADMINISTRADOR")
  @Patch()
  async actualizar(@Body() body: UpdateOrganizacionDto, @CurrentUser() actor: any) {
    const anterior = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: SELECT_ORGANIZACION,
    });

    const actualizada = await this.prisma.organizacion.update({
      where: { id: actor.organizacionId },
      data: body,
      select: SELECT_ORGANIZACION,
    });

    await this.prisma.auditLog.create({
      data: {
        usuarioId: actor.id,
        entidad: "Organizacion",
        entidadId: actor.organizacionId,
        accion: "organizacion_editada",
        datosAnteriores: anterior,
        datosNuevos: actualizada,
      },
    });

    return actualizada;
  }
}
