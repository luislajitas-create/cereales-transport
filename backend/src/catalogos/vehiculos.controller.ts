import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateVehiculoDto } from "./dto/create-vehiculo.dto";
import { UpdateVehiculoDto } from "./dto/update-vehiculo.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("vehiculos")
export class VehiculosController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(
    @Query("transportistaId") transportistaId?: string,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    const where: any = {};
    if (transportistaId) where.transportistaId = transportistaId;
    if (incluirInactivos !== "true") where.activo = true;
    return this.prisma.vehiculo.findMany({ where, orderBy: { patente: "asc" } });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateVehiculoDto) {
    return this.prisma.vehiculo.create({ data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateVehiculoDto) {
    return this.prisma.vehiculo.update({ where: { id }, data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.vehiculo.update({ where: { id }, data: { activo: false } });
  }
}
