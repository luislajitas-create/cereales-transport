import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { UsuarioGrupoLookupService } from "../prisma/usuario-grupo-lookup.service";
import { OtorgarAccesoDto } from "./dto/otorgar-acceso.dto";

// Bloque 10.3.a — administración de AccesoGrupoEconomico (DISENO_BLOQUE10.3_ACCESO_
// MULTIEMPRESA.md, secciones 1, 5 y 12; DECISIONES_TECNICAS_BLOQUE10.3.md). Mismo principio de
// aislamiento manual que GrupoEconomicoController e IdentidadChoferGrupoController: la
// organización que otorga/revoca siempre sale de @CurrentUser(), nunca de la URL o del body
// (Decisión Técnica 2 de Grupo Económico: "solo el Administrador de la organización involucrada
// otorga acceso"). No implementa todavía el cambio de organización activa ni emite ningún token
// — eso es Bloque 10.3.b, explícitamente fuera de este alcance. No recibe PrismaService crudo:
// la única consulta que necesita cruzar organizaciones (verificar al usuario destinatario) pasa
// por UsuarioGrupoLookupService, el único componente autorizado para eso (ver prisma.module.ts).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("grupo-economico")
export class AccesoGrupoController {
  constructor(
    @Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient,
    private usuarioLookup: UsuarioGrupoLookupService,
  ) {}

  // Confirma que el grupo :id existe y que la organización del actor pertenece a él — mismo
  // criterio que GrupoEconomicoController.asociar()/desasociar(): la organización que actúa
  // nunca sale de la URL, siempre es actor.organizacionId, comparada contra lo que el actor
  // realmente tiene asociado.
  private async verificarGrupo(id: string, actor: any): Promise<void> {
    const grupo = await this.prisma.grupoEconomico.findUnique({ where: { id }, select: { id: true } });
    if (!grupo) throw new NotFoundException("Grupo económico no encontrado.");

    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (organizacion?.grupoEconomicoId !== id) {
      throw new BadRequestException("Tu organización no pertenece a este grupo económico.");
    }
  }

  // Otorga acceso a un usuario de otra organización del mismo grupo para operar la organización
  // del actor. El rol del destinatario no se valida ni se acota acá — Decisión Técnica 1 de
  // Bloque 10.3: rol único, el mismo que ya tiene en su propia organización.
  @Roles("ADMINISTRADOR")
  @Post(":id/accesos")
  async otorgar(@Param("id") id: string, @Body() body: OtorgarAccesoDto, @CurrentUser() actor: any) {
    await this.verificarGrupo(id, actor);

    const destinatario = await this.usuarioLookup.verificarDestinatario(body.usuarioId);
    if (!destinatario) throw new NotFoundException("Usuario no encontrado.");
    if (destinatario.organizacionId === actor.organizacionId) {
      throw new BadRequestException("Ese usuario ya pertenece a tu organización.");
    }
    if (!destinatario.activo) {
      throw new BadRequestException("Ese usuario está inactivo.");
    }

    // Organizacion no es un modelo organizacional (fuera de ORGANIZACIONAL_MODELS) — esta
    // consulta no pasa por el filtrado de ORGANIZACION_PRISMA, puede leer cualquier
    // organización sin necesitar el servicio de lookup.
    const organizacionDestinatario = await this.prisma.organizacion.findUnique({
      where: { id: destinatario.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (organizacionDestinatario?.grupoEconomicoId !== id) {
      throw new BadRequestException("Ese usuario no pertenece a una organización de este grupo económico.");
    }

    // Chequeo informativo, no la garantía real: dos otorgamientos concurrentes para el mismo
    // par (usuarioId, organizacionId) quedan protegidos por la restricción única a nivel de
    // base (@@unique([usuarioId, organizacionId])) — la segunda escritura falla con P2002,
    // mapeado a 409 por PrismaExceptionFilter. A diferencia de Chofer.identidadChoferGrupoId
    // (Bloque 10.2, Hallazgo 1), acá no hace falta un updateMany condicional: no existe ningún
    // camino en el que una carrera produzca una sobrescritura silenciosa o un huérfano, porque
    // create() sobre una fila nueva, protegida por un índice único real, ya es atómico por
    // construcción.
    const yaExiste = await this.prisma.accesoGrupoEconomico.findUnique({
      where: { usuarioId_organizacionId: { usuarioId: destinatario.id, organizacionId: actor.organizacionId } },
      select: { id: true },
    });
    if (yaExiste) {
      throw new BadRequestException("Ese usuario ya tiene acceso otorgado a tu organización.");
    }

    const accesoId = await this.prisma.$transaction(async (tx) => {
      const acceso = await tx.accesoGrupoEconomico.create({
        data: { usuarioId: destinatario.id, organizacionId: actor.organizacionId, otorgadoPorId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "AccesoGrupoEconomico",
          entidadId: acceso.id,
          accion: "acceso_grupo_otorgado",
          datosNuevos: { usuarioId: destinatario.id, organizacionId: actor.organizacionId },
        },
      });
      return acceso.id;
    });

    return this.prisma.accesoGrupoEconomico.findUnique({ where: { id: accesoId } });
  }

  // Lista los accesos otorgados POR la organización del actor — nunca los otorgados por otra
  // organización del mismo grupo (DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md, sección 5).
  @Roles("ADMINISTRADOR")
  @Get(":id/accesos")
  async listar(@Param("id") id: string, @CurrentUser() actor: any) {
    await this.verificarGrupo(id, actor);
    return this.prisma.accesoGrupoEconomico.findMany({
      where: { organizacionId: actor.organizacionId },
      select: { id: true, usuarioId: true, otorgadoPorId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  // Revoca un acceso ya otorgado. Solo afecta accesos otorgados por la propia organización del
  // actor — un intento sobre un acceso de otra organización responde 404, sin revelar que
  // existe (mismo criterio de falla segura ya usado en 10.1/10.2).
  @Roles("ADMINISTRADOR")
  @Delete(":id/accesos/:accesoId")
  async revocar(@Param("id") id: string, @Param("accesoId") accesoId: string, @CurrentUser() actor: any) {
    await this.verificarGrupo(id, actor);

    const acceso = await this.prisma.accesoGrupoEconomico.findFirst({
      where: { id: accesoId, organizacionId: actor.organizacionId },
      select: { id: true, usuarioId: true },
    });
    if (!acceso) throw new NotFoundException("Acceso no encontrado.");

    await this.prisma.$transaction(async (tx) => {
      await tx.accesoGrupoEconomico.delete({ where: { id: acceso.id } });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "AccesoGrupoEconomico",
          entidadId: acceso.id,
          accion: "acceso_grupo_revocado",
          datosAnteriores: { usuarioId: acceso.usuarioId, organizacionId: actor.organizacionId },
        },
      });
    });

    return { revocado: true };
  }
}
