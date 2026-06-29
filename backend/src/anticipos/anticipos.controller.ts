import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UseGuards,
    BadRequestException,
    NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

function formatMoney(n: number) {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

@Controller("anticipos")
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class AnticiposController {
    constructor(private prisma: PrismaService) {}

  // TODO: Agregar el modelo anticipoGasto al schema.prisma para habilitar estas funciones
  // Las siguientes funciones están comentadas porque el modelo anticipoGasto no está definido en Prisma

  /*
    @Get()
    async findAll(
      @Query("desdeId") desdeId?: string,
      @Query("hastaId") hastaId?: string,
      @Query("liquidado") liquidado?: string,
      @Query("anulado") anulado?: string,
    ) {
      const where: any = {};

      const anticipos = await this.prisma.anticipoGasto.findMany({
        where,
        include: { includeAnticipo },
        orderBy: { fecha: "desc" },
      });

      return anticipos;
    }

    @Get("export/excel")
    async exportarExcel(@Res() res: Response) {
      const anticipos = await this.prisma.anticipoGasto.findMany({});

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Anticipos");

      return res;
    }

    @Get(":id")
    async findOne(@Param("id") id: string) {
      const anticipo = await this.prisma.anticipoGasto.findUnique({});
      return anticipo;
    }

    @Post()
    async create(@Body() data: any) {
      return this.prisma.anticipoGasto.create({});
    }

    @Patch(":id")
    async update(@Param("id") id: string, @Body() data: any) {
      return this.prisma.anticipoGasto.update({});
    }
    */
}
