import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("cereales")
export class CerealesController {
  constructor(private prisma: PrismaService) {}
  @Get() findAll() { return this.prisma.cereal.findMany({ orderBy: { nombre: "asc" } }); }
  @Post() create(@Body() body: any) { return this.prisma.cereal.create({ data: body }); }
}

@UseGuards(JwtAuthGuard)
@Controller("ubicaciones")
export class UbicacionesController {
  constructor(private prisma: PrismaService) {}
  @Get() findAll() { return this.prisma.ubicacion.findMany({ orderBy: { nombre: "asc" } }); }
  @Post() create(@Body() body: any) { return this.prisma.ubicacion.create({ data: body }); }
}

@UseGuards(JwtAuthGuard)
@Controller("tipos-gasto")
export class TiposGastoController {
  constructor(private prisma: PrismaService) {}
  @Get() findAll() { return this.prisma.tipoGasto.findMany({ orderBy: { nombre: "asc" } }); }
  @Post() create(@Body() body: any) { return this.prisma.tipoGasto.create({ data: body }); }
}

@UseGuards(JwtAuthGuard)
@Controller("productores")
export class ProductoresController {
  constructor(private prisma: PrismaService) {}
  @Get() findAll() { return this.prisma.productor.findMany({ orderBy: { nombre: "asc" } }); }
  @Post() create(@Body() body: any) { return this.prisma.productor.create({ data: body }); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: any) {
    return this.prisma.productor.update({ where: { id }, data: body });
  }
}

@UseGuards(JwtAuthGuard)
@Controller("usuarios")
export class UsuariosController {
  constructor(private prisma: PrismaService) {}
  @Get() findAll() {
    return this.prisma.usuario.findMany({ select: { id: true, nombre: true, email: true, rol: true, activo: true } });
  }
}
