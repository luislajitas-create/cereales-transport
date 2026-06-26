import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
@Controller("choferes")
export class ChoferesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(@Query("transportistaId") transportistaId?: string) {
    return this.prisma.chofer.findMany({
      where: transportistaId ? { transportistaId } : undefined,
      orderBy: { nombre: "asc" },
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.chofer.findUnique({ where: { id } });
  }

  @Post()
  create(@Body() body: any) {
    return this.prisma.chofer.create({ data: body });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    return this.prisma.chofer.update({ where: { id }, data: body });
  }
}
