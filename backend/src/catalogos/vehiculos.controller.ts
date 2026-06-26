import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("vehiculos")
export class VehiculosController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(@Query("transportistaId") transportistaId?: string) {
    return this.prisma.vehiculo.findMany({
      where: transportistaId ? { transportistaId } : undefined,
      orderBy: { patente: "asc" },
    });
  }

  @Post()
  create(@Body() body: any) {
    return this.prisma.vehiculo.create({ data: body });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.prisma.vehiculo.update({ where: { id }, data: body });
  }
}
