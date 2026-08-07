import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { encontrarOFallar } from "../common/encontrar-o-fallar";
import { registrarAuditoria, calcularCamposCambiados, subconjunto } from "../common/auditoria";
import { CreateCerealDto } from "./dto/create-cereal.dto";
import { CreateUbicacionDto } from "./dto/create-ubicacion.dto";
import { CreateTipoGastoDto } from "./dto/create-tipo-gasto.dto";
import { CreateProductorDto } from "./dto/create-productor.dto";
import { UpdateProductorDto } from "./dto/update-productor.dto";

// CAT-7: los cuatro catálogos de este archivo, a diferencia de Cliente/Transportista/Chofer/
// Vehiculo (CAT-4), no tienen columna "activo" en el schema ni endpoint de edición/baja — la
// auditoría previa a este bloque (AUDITORIA_CATALOGOS.md, sección CAT-7) confirmó que hoy solo
// existen realmente: alta en los cuatro, y edición en Productor (el único con @Patch). No se
// inventa ningún endpoint ni acción de estado que no exista — decisión confirmada explícitamente
// con el Product Owner antes de escribir este archivo.

const ENTIDAD_CEREAL = "Cereal";
function snapshotCereal(c: { nombre: string }) {
  return { nombre: c.nombre };
}

const ENTIDAD_UBICACION = "Ubicacion";
function snapshotUbicacion(u: { nombre: string; tipo: string; localidad: string | null }) {
  return { nombre: u.nombre, tipo: u.tipo, localidad: u.localidad };
}

const ENTIDAD_TIPO_GASTO = "TipoGasto";
function snapshotTipoGasto(t: { nombre: string; afectaLiquidacion: boolean }) {
  return { nombre: t.nombre, afectaLiquidacion: t.afectaLiquidacion };
}

// CAT-6: CUIT ya llega canónico (solo dígitos) o null desde el DTO (normalizarCuitOpcional) antes
// de que este snapshot se construya — nunca se normaliza acá.
const ENTIDAD_PRODUCTOR = "Productor";
function snapshotProductor(p: { nombre: string; cuit: string | null; localidad: string | null }) {
  return { nombre: p.nombre, cuit: p.cuit, localidad: p.localidad };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cereales")
export class CerealesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get() findAll() { return this.prisma.cereal.findMany({ orderBy: { nombre: "asc" } }); }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateCerealDto, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.cereal.create({ data: body });
      await registrarAuditoria(tx, {
        usuarioId: actor.id,
        entidad: ENTIDAD_CEREAL,
        entidadId: creado.id,
        accion: "cereal_creado",
        datosNuevos: snapshotCereal(creado),
      });
      return creado;
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ubicaciones")
export class UbicacionesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get() findAll() { return this.prisma.ubicacion.findMany({ orderBy: { nombre: "asc" } }); }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateUbicacionDto, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const creada = await tx.ubicacion.create({ data: body });
      await registrarAuditoria(tx, {
        usuarioId: actor.id,
        entidad: ENTIDAD_UBICACION,
        entidadId: creada.id,
        accion: "ubicacion_creada",
        datosNuevos: snapshotUbicacion(creada),
      });
      return creada;
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tipos-gasto")
export class TiposGastoController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get() findAll() { return this.prisma.tipoGasto.findMany({ orderBy: { nombre: "asc" } }); }

  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateTipoGastoDto, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.tipoGasto.create({ data: body });
      await registrarAuditoria(tx, {
        usuarioId: actor.id,
        entidad: ENTIDAD_TIPO_GASTO,
        entidadId: creado.id,
        accion: "tipo_gasto_creado",
        datosNuevos: snapshotTipoGasto(creado),
      });
      return creado;
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("productores")
export class ProductoresController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get() findAll() { return this.prisma.productor.findMany({ orderBy: { nombre: "asc" } }); }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateProductorDto, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.productor.create({ data: body });
      await registrarAuditoria(tx, {
        usuarioId: actor.id,
        entidad: ENTIDAD_PRODUCTOR,
        entidadId: creado.id,
        accion: "productor_creado",
        datosNuevos: snapshotProductor(creado),
      });
      return creado;
    });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateProductorDto, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const actual = encontrarOFallar(await tx.productor.findUnique({ where: { id } }), "Productor no encontrado.");
      const actualizado = await tx.productor.update({ where: { id }, data: body });

      // Productor no tiene columna "activo" — a diferencia de CAT-4, nunca hay evento de
      // estado acá, solo "productor_editado" cuando algún campo realmente cambió.
      const antes = snapshotProductor(actual);
      const despues = snapshotProductor(actualizado);
      const cambios = calcularCamposCambiados(antes, despues);

      if (cambios.length > 0) {
        const claves = Array.from(new Set(["nombre", ...cambios]));
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          entidad: ENTIDAD_PRODUCTOR,
          entidadId: id,
          accion: "productor_editado",
          datosAnteriores: subconjunto(antes, claves),
          datosNuevos: subconjunto(despues, claves),
        });
      }
      return actualizado;
    });
  }
}
