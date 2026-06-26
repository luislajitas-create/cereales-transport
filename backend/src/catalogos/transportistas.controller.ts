import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("transportistas")
export class TransportistasController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.transportista.findMany({
      include: { choferes: true, vehiculos: true },
      orderBy: { razonSocial: "asc" },
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.transportista.findUnique({
      where: { id },
      include: { choferes: true, vehiculos: true },
    });
  }

  @Post()
  create(@Body() body: any) {
    return this.prisma.transportista.create({ data: body });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.prisma.transportista.update({ where: { id }, data: body });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.transportista.update({ where: { id }, data: { activo: false } });
  }
}
