import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateCerealDto } from "./dto/create-cereal.dto";
import { CreateUbicacionDto } from "./dto/create-ubicacion.dto";
import { CreateTipoGastoDto } from "./dto/create-tipo-gasto.dto";
import { CreateProductorDto } from "./dto/create-productor.dto";
import { UpdateProductorDto } from "./dto/update-productor.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cereales")
export class CerealesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}
  @Get() findAll() { return this.prisma.cereal.findMany({ orderBy: { nombre: "asc" } }); }
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post() create(@Body() body: CreateCerealDto) { return this.prisma.cereal.create({ data: body }); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ubicaciones")
export class UbicacionesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}
  @Get() findAll() { return this.prisma.ubicacion.findMany({ orderBy: { nombre: "asc" } }); }
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post() create(@Body() body: CreateUbicacionDto) { return this.prisma.ubicacion.create({ data: body }); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tipos-gasto")
export class TiposGastoController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}
  @Get() findAll() { return this.prisma.tipoGasto.findMany({ orderBy: { nombre: "asc" } }); }
  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Post() create(@Body() body: CreateTipoGastoDto) { return this.prisma.tipoGasto.create({ data: body }); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("productores")
export class ProductoresController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}
  @Get() findAll() { return this.prisma.productor.findMany({ orderBy: { nombre: "asc" } }); }
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post() create(@Body() body: CreateProductorDto) { return this.prisma.productor.create({ data: body }); }
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id") update(@Param("id") id: string, @Body() body: UpdateProductorDto) {
    return this.prisma.productor.update({ where: { id }, data: body });
  }
}

@UseGuards(JwtAuthGuard)
@Controller("usuarios")
export class UsuariosController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}
  @Get() findAll() {
    return this.prisma.usuario.findMany({ select: { id: true, nombre: true, email: true, rol: true, activo: true } });
  }
}
