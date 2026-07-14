import { Body, Controller, Get, Inject, Patch, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { UpdateOrganizacionDto } from "./dto/update-organizacion.dto";

const AUDITORIA_LIMITE_DEFECTO = 20;
const AUDITORIA_LIMITE_MAXIMO = 100;

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

  // Bloque 9.5 (consulta) — auditLog es un modelo organizacional: el aislamiento por
  // organizacionId lo aplica ORGANIZACION_PRISMA automáticamente (organizacion-prisma.client.ts)
  // sobre CUALQUIER where que se le pase, incluidos los filtros de abajo — por eso alcanza con
  // construir el where con los filtros solicitados, sin agregar organizacionId acá (sería un
  // filtro duplicado). Esto es lo que garantiza que un usuarioId o entidadId de otra
  // organización nunca devuelva resultados, aunque coincida con un id real de otra org.
  @Roles("ADMINISTRADOR")
  @Get("auditoria")
  async auditoria(
    @Query("usuarioId") usuarioId?: string,
    @Query("entidad") entidad?: string,
    @Query("entidadId") entidadId?: string,
    @Query("accion") accion?: string,
    @Query("fechaDesde") fechaDesde?: string,
    @Query("fechaHasta") fechaHasta?: string,
    @Query("page") pageRaw?: string,
    @Query("limit") limitRaw?: string,
  ) {
    const where: any = {};
    if (usuarioId) where.usuarioId = usuarioId;
    if (entidad) where.entidad = entidad;
    if (entidadId) where.entidadId = entidadId;
    if (accion) where.accion = accion;
    if (fechaDesde || fechaHasta) {
      where.fecha = {};
      if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
      if (fechaHasta) where.fecha.lte = new Date(fechaHasta);
    }

    const page = Math.max(1, parseInt(pageRaw ?? "", 10) || 1);
    const limit = Math.min(AUDITORIA_LIMITE_MAXIMO, Math.max(1, parseInt(limitRaw ?? "", 10) || AUDITORIA_LIMITE_DEFECTO));

    const [total, datos] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { fecha: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fecha: true,
          accion: true,
          entidad: true,
          entidadId: true,
          usuarioId: true,
          usuario: { select: { nombre: true, email: true, rol: true } },
        },
      }),
    ]);

    return { datos, pagina: page, limite: limit, total };
  }
}
