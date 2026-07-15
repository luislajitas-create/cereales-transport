import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateIdentidadChoferDto } from "./dto/create-identidad-chofer.dto";
import { VincularChoferDto } from "./dto/vincular-chofer.dto";

// Select de una identidad, siempre acotado a los choferes de la organización de quien consulta
// — nunca expone nombre/cuil de un Chofer de otra organización del mismo grupo, solo el
// conteo total vinculado (_count), sin detalle. Bloque 10.3 (acceso multiempresa, todavía sin
// implementar) es lo que en el futuro permitiría ver el detalle completo entre organizaciones.
function selectIdentidad(organizacionId: string) {
  return {
    id: true,
    nombreReferencia: true,
    createdAt: true,
    choferes: { where: { organizacionId }, select: { id: true, nombre: true } },
    _count: { select: { choferes: true } },
  } as const;
}

// Bloque 10.2 — identidad compartida de Chofer entre organizaciones del mismo Grupo Económico
// (GRUPO_ECONOMICO_DISENO_TECNICO.md, secciones 10 y 12). Mismo principio de aislamiento manual
// que GrupoEconomicoController (10.1): el Chofer y la organización sobre los que se actúa
// siempre salen de @CurrentUser(), nunca de la URL o del body — nadie puede vincular ni
// consultar un Chofer que no sea de su propia organización. Nunca se infiere un vínculo por
// nombre: toda vinculación exige un choferId real, elegido explícitamente por quien opera.
//
// No implementa acceso multiempresa ni cambio de organización activa (eso es Bloque 10.3) — por
// eso "candidatos" y el detalle de una identidad solo muestran los choferes de la PROPIA
// organización del actor. Vincular el chofer correspondiente de la otra organización del grupo
// requiere que el Administrador de esa otra organización ejecute, por separado, la misma acción
// desde su propia sesión — mismo patrón ya usado en 10.1 para asociar cada organización a un
// grupo (cada Administrador actúa únicamente sobre lo suyo).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("grupo-economico/choferes")
export class IdentidadChoferGrupoController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  private async grupoDeLaOrganizacion(organizacionId: string): Promise<string> {
    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (!organizacion?.grupoEconomicoId) {
      throw new BadRequestException("Tu organización no pertenece a un grupo económico.");
    }
    return organizacion.grupoEconomicoId;
  }

  // Choferes de mi organización todavía sin identidad de grupo — los únicos elegibles para
  // crear una identidad nueva o vincularse a una existente.
  @Roles("ADMINISTRADOR")
  @Get("candidatos")
  async candidatos(@CurrentUser() actor: any) {
    await this.grupoDeLaOrganizacion(actor.organizacionId);
    return this.prisma.chofer.findMany({
      where: { identidadChoferGrupoId: null },
      select: { id: true, nombre: true, cuil: true, activo: true },
      orderBy: { nombre: "asc" },
    });
  }

  @Roles("ADMINISTRADOR")
  @Get("identidades")
  async listar(@CurrentUser() actor: any) {
    const grupoEconomicoId = await this.grupoDeLaOrganizacion(actor.organizacionId);
    return this.prisma.identidadChoferGrupo.findMany({
      where: { grupoEconomicoId },
      select: selectIdentidad(actor.organizacionId),
      orderBy: { createdAt: "desc" },
    });
  }

  @Roles("ADMINISTRADOR")
  @Get("identidades/:id")
  async detalle(@Param("id") id: string, @CurrentUser() actor: any) {
    const grupoEconomicoId = await this.grupoDeLaOrganizacion(actor.organizacionId);
    // findFirst con id + grupoEconomicoId en el mismo where: si la identidad existe pero
    // pertenece a otro grupo, devuelve null igual que si no existiera — nunca revela que una
    // identidad de otro grupo existe (mismo criterio de "falla segura" de organizacion-prisma).
    const identidad = await this.prisma.identidadChoferGrupo.findFirst({
      where: { id, grupoEconomicoId },
      select: selectIdentidad(actor.organizacionId),
    });
    if (!identidad) throw new NotFoundException("Identidad de grupo no encontrada.");
    return identidad;
  }

  // Crea la identidad y vincula, en la misma transacción, el chofer fundador de la organización
  // del actor — nunca existe una identidad sin al menos un chofer real que la originó.
  //
  // Corrección Hallazgo 1 (auditoría técnica independiente, post-10.2): el chequeo de arriba
  // (chofer.identidadChoferGrupoId) es solo informativo — mejora el mensaje en el caso común,
  // pero NO es lo que garantiza corrección ante concurrencia real. La garantía real es el
  // updateMany condicional de abajo, dentro de la misma transacción que crea la identidad:
  // mismo patrón ya usado en LiquidacionesController.create() (where con la condición de
  // "todavía libre" + verificación de count). Si count da 0 (otra solicitud concurrente ganó la
  // carrera entre el chequeo y este punto), se lanza una excepción DENTRO de la transacción —
  // Prisma revierte también la creación de la identidad ya ejecutada en el mismo callback, así
  // que nunca queda una identidad huérfana persistida.
  @Roles("ADMINISTRADOR")
  @Post("identidades")
  async crear(@Body() body: CreateIdentidadChoferDto, @CurrentUser() actor: any) {
    const grupoEconomicoId = await this.grupoDeLaOrganizacion(actor.organizacionId);
    const chofer = await this.prisma.chofer.findFirst({
      where: { id: body.choferId, organizacionId: actor.organizacionId },
      select: { id: true, identidadChoferGrupoId: true },
    });
    if (!chofer) throw new NotFoundException("Chofer no encontrado en tu organización.");
    if (chofer.identidadChoferGrupoId) {
      throw new BadRequestException("Ese chofer ya pertenece a una identidad de grupo.");
    }

    const identidadId = await this.prisma.$transaction(async (tx) => {
      const identidad = await tx.identidadChoferGrupo.create({
        data: { grupoEconomicoId, nombreReferencia: body.nombreReferencia, creadoPorId: actor.id },
      });

      const { count } = await tx.chofer.updateMany({
        where: { id: chofer.id, identidadChoferGrupoId: null },
        data: { identidadChoferGrupoId: identidad.id },
      });
      if (count === 0) {
        throw new BadRequestException(
          "Ese chofer ya fue vinculado a una identidad de grupo por otra operación en curso — la creación no se aplicó.",
        );
      }

      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "IdentidadChoferGrupo",
          entidadId: identidad.id,
          accion: "identidad_chofer_creada",
          datosNuevos: { nombreReferencia: identidad.nombreReferencia, grupoEconomicoId },
        },
      });
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "Chofer",
          entidadId: chofer.id,
          accion: "chofer_vinculado_a_identidad_grupo",
          datosNuevos: { identidadChoferGrupoId: identidad.id },
        },
      });
      return identidad.id;
    });

    return this.prisma.identidadChoferGrupo.findUnique({
      where: { id: identidadId },
      select: selectIdentidad(actor.organizacionId),
    });
  }

  // Vincula un chofer YA EXISTENTE de la organización del actor a una identidad ya existente.
  //
  // Corrección Hallazgo 1: mismo patrón que crear() — el chequeo previo es solo informativo, la
  // garantía real es el updateMany condicional dentro de la transacción. Si otra solicitud
  // concurrente ya vinculó a este chofer entre el chequeo y la escritura, count da 0 y la
  // operación falla explícitamente, sin sobrescribir nada y sin dejar un AuditLog parcial (el
  // create de auditoría nunca se ejecuta si el updateMany no afectó ninguna fila).
  @Roles("ADMINISTRADOR")
  @Post("identidades/:id/vincular")
  async vincular(@Param("id") id: string, @Body() body: VincularChoferDto, @CurrentUser() actor: any) {
    const grupoEconomicoId = await this.grupoDeLaOrganizacion(actor.organizacionId);
    const identidad = await this.prisma.identidadChoferGrupo.findFirst({
      where: { id, grupoEconomicoId },
      select: { id: true },
    });
    if (!identidad) throw new NotFoundException("Identidad de grupo no encontrada.");

    const chofer = await this.prisma.chofer.findFirst({
      where: { id: body.choferId, organizacionId: actor.organizacionId },
      select: { id: true, identidadChoferGrupoId: true },
    });
    if (!chofer) throw new NotFoundException("Chofer no encontrado en tu organización.");
    if (chofer.identidadChoferGrupoId) {
      throw new BadRequestException(
        chofer.identidadChoferGrupoId === id
          ? "Ese chofer ya está vinculado a esta identidad."
          : "Ese chofer ya pertenece a otra identidad de grupo. Desvinculalo antes de vincularlo a esta.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.chofer.updateMany({
        where: { id: chofer.id, identidadChoferGrupoId: null },
        data: { identidadChoferGrupoId: id },
      });
      if (count === 0) {
        throw new BadRequestException(
          "Ese chofer ya fue vinculado a una identidad de grupo por otra operación en curso — la solicitud no se aplicó.",
        );
      }
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "Chofer",
          entidadId: chofer.id,
          accion: "chofer_vinculado_a_identidad_grupo",
          datosNuevos: { identidadChoferGrupoId: id },
        },
      });
    });

    return this.prisma.identidadChoferGrupo.findUnique({ where: { id }, select: selectIdentidad(actor.organizacionId) });
  }

  // Desvincula un chofer de la organización del actor de la identidad indicada. Reversible:
  // el chofer sigue existiendo, con todo su historial, simplemente deja de estar vinculado.
  //
  // Corrección Hallazgo 3: ahora valida, con el mismo findFirst({ id, grupoEconomicoId }) que ya
  // usan detalle() y vincular(), que la identidad exista y pertenezca al grupo del actor ANTES
  // de comparar contra el chofer — responde 404 sin revelar identidades de otros grupos, en vez
  // de depender solo de que el chofer nunca pudiera estar vinculado a una identidad ajena.
  //
  // Corrección Hallazgo 1 (extendida por consistencia, mismo principio aunque no fue el caso
  // señalado explícitamente): la escritura también queda protegida con updateMany condicional,
  // para que una desvinculación nunca revierta por error un vínculo que otra operación ya haya
  // cambiado entre el chequeo y la escritura.
  @Roles("ADMINISTRADOR")
  @Post("identidades/:id/desvincular")
  async desvincular(@Param("id") id: string, @Body() body: VincularChoferDto, @CurrentUser() actor: any) {
    const grupoEconomicoId = await this.grupoDeLaOrganizacion(actor.organizacionId);
    const identidad = await this.prisma.identidadChoferGrupo.findFirst({
      where: { id, grupoEconomicoId },
      select: { id: true },
    });
    if (!identidad) throw new NotFoundException("Identidad de grupo no encontrada.");

    const chofer = await this.prisma.chofer.findFirst({
      where: { id: body.choferId, organizacionId: actor.organizacionId },
      select: { id: true, identidadChoferGrupoId: true },
    });
    if (!chofer || chofer.identidadChoferGrupoId !== id) {
      throw new BadRequestException("Ese chofer no está vinculado a esta identidad.");
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.chofer.updateMany({
        where: { id: chofer.id, identidadChoferGrupoId: id },
        data: { identidadChoferGrupoId: null },
      });
      if (count === 0) {
        throw new BadRequestException("Ese chofer ya no está vinculado a esta identidad — la solicitud no se aplicó.");
      }
      await tx.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "Chofer",
          entidadId: chofer.id,
          accion: "chofer_desvinculado_de_identidad_grupo",
          datosAnteriores: { identidadChoferGrupoId: id },
        },
      });
    });

    return { desvinculado: true };
  }
}
