import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateGrupoEconomicoDto } from "./dto/create-grupo-economico.dto";

const SELECT_ORGANIZACION_MIEMBRO = { id: true, nombre: true };
const SELECT_GRUPO = {
  id: true,
  nombre: true,
  createdAt: true,
  organizaciones: { select: SELECT_ORGANIZACION_MIEMBRO },
};

// Bloque 10.1 — modelo base de Grupo Económico (GRUPO_ECONOMICO_DISENO_TECNICO.md, secciones
// 1, 10 y 12). GrupoEconomico y el campo Organizacion.grupoEconomicoId no son organizacionales
// (no viven en ORGANIZACIONAL_MODELS) — el aislamiento acá es manual, exactamente el mismo
// patrón que ya usa OrganizacionController para Organizacion misma: el id de la organización
// del actor sale siempre de @CurrentUser() (derivado del JWT ya validado), nunca de un
// parámetro de la URL o del body. No existe ningún rol SUPERADMIN ni ningún camino para que el
// Administrador de una organización asocie o desasocie una organización que no sea la suya.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("grupo-economico")
export class GrupoEconomicoController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  // Consulta el grupo económico de la organización activa del actor, si tiene uno. Restringido
  // a ADMINISTRADOR (a diferencia de GET /organizacion, que es de lectura abierta): un grupo
  // económico revela la existencia de otra organización, información que en esta primera
  // versión se trata como administrativa, no como algo que cualquier rol deba ver por defecto.
  @Roles("ADMINISTRADOR")
  @Get()
  async miGrupo(@CurrentUser() actor: any) {
    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (!organizacion?.grupoEconomicoId) return null;
    return this.prisma.grupoEconomico.findUnique({
      where: { id: organizacion.grupoEconomicoId },
      select: SELECT_GRUPO,
    });
  }

  // Crea un grupo económico nuevo y asocia, en la misma operación, la organización del actor
  // como su primera integrante. No existe una vía para crear un grupo "vacío" ni para que
  // alguien sin organización real lo cree — evita a propósito cualquier necesidad de un rol de
  // plataforma/SUPERADMIN (DECISIONES_TECNICAS_GRUPO_ECONOMICO.md).
  @Roles("ADMINISTRADOR")
  @Post()
  async crear(@Body() body: CreateGrupoEconomicoDto, @CurrentUser() actor: any) {
    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { id: true, grupoEconomicoId: true },
    });
    if (organizacion?.grupoEconomicoId) {
      throw new BadRequestException("Tu organización ya pertenece a un grupo económico.");
    }

    const grupoId = await this.prisma.$transaction(async (tx) => {
      const grupo = await tx.grupoEconomico.create({ data: { nombre: body.nombre } });
      await tx.organizacion.update({
        where: { id: actor.organizacionId },
        data: { grupoEconomicoId: grupo.id },
      });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "GrupoEconomico",
          entidadId: grupo.id,
          accion: "grupo_economico_creado",
          datosNuevos: { nombre: grupo.nombre, organizacionFundadoraId: actor.organizacionId },
        },
      });
      return grupo.id;
    });

    return this.prisma.grupoEconomico.findUnique({ where: { id: grupoId }, select: SELECT_GRUPO });
  }

  // Asocia la organización del actor a un grupo económico ya existente. El grupo se identifica
  // por :id en la URL, pero la organización que se asocia nunca sale de la URL ni del body —
  // siempre es actor.organizacionId. Esto es lo que impide, estructuralmente, que el
  // Administrador de una organización controle unilateralmente la membresía de otra
  // (DECISIONES_TECNICAS_GRUPO_ECONOMICO.md, Decisión 2).
  @Roles("ADMINISTRADOR")
  @Post(":id/organizaciones")
  async asociar(@Param("id") id: string, @CurrentUser() actor: any) {
    const grupo = await this.prisma.grupoEconomico.findUnique({ where: { id }, select: { id: true } });
    if (!grupo) throw new NotFoundException("Grupo económico no encontrado.");

    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (organizacion?.grupoEconomicoId) {
      throw new BadRequestException(
        organizacion.grupoEconomicoId === id
          ? "Tu organización ya pertenece a este grupo económico."
          : "Tu organización ya pertenece a otro grupo económico. Desasociala antes de sumarla a este.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organizacion.update({ where: { id: actor.organizacionId }, data: { grupoEconomicoId: id } });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "GrupoEconomico",
          entidadId: id,
          accion: "grupo_economico_organizacion_asociada",
          datosNuevos: { organizacionId: actor.organizacionId },
        },
      });
    });

    return this.prisma.grupoEconomico.findUnique({ where: { id }, select: SELECT_GRUPO });
  }

  // Desasocia la organización del actor de un grupo económico. Mismo principio que arriba: la
  // organización que se quita nunca sale de la URL/body, siempre es actor.organizacionId — un
  // Administrador solo puede sacar a su propia organización, nunca a otra.
  @Roles("ADMINISTRADOR")
  @Post(":id/organizaciones/desasociar")
  async desasociar(@Param("id") id: string, @CurrentUser() actor: any) {
    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (organizacion?.grupoEconomicoId !== id) {
      throw new BadRequestException("Tu organización no pertenece a este grupo económico.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organizacion.update({ where: { id: actor.organizacionId }, data: { grupoEconomicoId: null } });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "GrupoEconomico",
          entidadId: id,
          accion: "grupo_economico_organizacion_desasociada",
          datosAnteriores: { organizacionId: actor.organizacionId },
        },
      });
    });

    return { desasociada: true };
  }
}
