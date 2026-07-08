import {
  Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAnticipoDto } from "./dto/create-anticipo.dto";
import { UpdateAnticipoDto } from "./dto/update-anticipo.dto";
import { AnularAnticipoDto } from "./dto/anular-anticipo.dto";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

const includeAnticipo = {
  chofer: true,
  transportista: true,
  tipoGasto: true,
  viaje: { select: { id: true, numeroViaje: true, ctg: true, fecha: true } },
  usuario: { select: { id: true, nombre: true } },
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("anticipos")
export class AnticiposController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("choferId") choferId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("liquidado") liquidado?: string,
    @Query("anulado") anulado?: string,
  ) {
    const where: any = {};
    if (choferId) where.choferId = choferId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (liquidado !== undefined) where.liquidado = liquidado === "true";
    if (anulado !== undefined) where.anulado = anulado === "true";
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    return this.prisma.anticipoGasto.findMany({
      where,
      include: includeAnticipo,
      orderBy: { fecha: "desc" },
    });
  }

  @Get("export/excel")
  async exportarExcel(
    @Query("choferId") choferId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("liquidado") liquidado?: string,
    @Query("anulado") anulado?: string,
    @Res() res?: Response,
  ) {
    const where: any = {};
    if (choferId) where.choferId = choferId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (liquidado !== undefined) where.liquidado = liquidado === "true";
    if (anulado !== undefined) where.anulado = anulado === "true";
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    const anticipos = await this.prisma.anticipoGasto.findMany({
      where,
      include: includeAnticipo,
      orderBy: { fecha: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Anticipos");

    sheet.addRow(["Consulta de Anticipos y Gastos"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Fecha", "Chofer", "Transportista", "Tipo Gasto", "Importe", "Viaje", "Liquidado", "Anulado"]);
    header.font = { bold: true };

    for (const a of anticipos) {
      sheet.addRow([
        new Date(a.fecha).toLocaleDateString("es-AR"),
        a.chofer?.nombre || "-",
        a.transportista?.razonSocial || "-",
        a.tipoGasto?.nombre || "-",
        fmtMoney(a.importe),
        a.viaje?.ctg || "-",
        a.liquidado ? "Sí" : "No",
        a.anulado ? "Sí" : "No",
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="anticipos-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(
    @Query("choferId") choferId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("liquidado") liquidado?: string,
    @Query("anulado") anulado?: string,
    @Res() res?: Response,
  ) {
    const where: any = {};
    if (choferId) where.choferId = choferId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (liquidado !== undefined) where.liquidado = liquidado === "true";
    if (anulado !== undefined) where.anulado = anulado === "true";
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    const anticipos = await this.prisma.anticipoGasto.findMany({
      where,
      include: includeAnticipo,
      orderBy: { fecha: "desc" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="anticipos-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Consulta de Anticipos y Gastos", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Fecha", "Chofer", "Transportista", "Tipo Gasto", "Importe", "Viaje", "Liquidado", "Anulado"]];
    for (const a of anticipos) {
      tableData.push([
        new Date(a.fecha).toLocaleDateString("es-AR"),
        a.chofer?.nombre || "-",
        a.transportista?.razonSocial || "-",
        a.tipoGasto?.nombre || "-",
        fmtMoney(a.importe),
        a.viaje?.ctg || "-",
        a.liquidado ? "Sí" : "No",
        a.anulado ? "Sí" : "No",
      ]);
    }

    doc.fontSize(8);
    const colWidths = [45, 60, 60, 50, 50, 40, 40, 40];
    let y = doc.y;

    tableData[0].forEach((cell, i) => {
      doc.text(cell, 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i], align: "left" });
    });
    y += 15;
    doc.moveTo(40, y).lineTo(550, y).stroke();
    y += 5;

    for (let idx = 1; idx < tableData.length; idx++) {
      tableData[idx].forEach((cell, i) => {
        doc.text(cell, 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i], align: "left" });
      });
      y += 12;
      if (y > 700) {
        doc.addPage();
        y = 40;
      }
    }

    doc.end();
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const anticipo = await this.prisma.anticipoGasto.findUnique({
      where: { id },
      include: includeAnticipo,
    });
    if (!anticipo) throw new NotFoundException("Anticipo/gasto no encontrado");
    return anticipo;
  }

  @Roles("LIQUIDACIONES", "OPERACIONES", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateAnticipoDto, @CurrentUser() user: any) {
    if (!body.choferId || !body.transportistaId || !body.tipoGastoId) {
      throw new BadRequestException("choferId, transportistaId y tipoGastoId son obligatorios");
    }

    const chofer = await this.prisma.chofer.findUnique({ where: { id: body.choferId } });
    if (!chofer) throw new NotFoundException("Chofer no encontrado.");
    if (!chofer.activo) {
      throw new BadRequestException("El chofer seleccionado está dado de baja. Reactívelo antes de crear el anticipo/gasto.");
    }

    const transportista = await this.prisma.transportista.findUnique({ where: { id: body.transportistaId } });
    if (!transportista) throw new NotFoundException("Transportista no encontrado.");
    if (!transportista.activo) {
      throw new BadRequestException("El transportista seleccionado está dado de baja. Reactívelo antes de crear el anticipo/gasto.");
    }

    return this.prisma.anticipoGasto.create({
      data: {
        viajeId: body.viajeId || null,
        choferId: body.choferId,
        transportistaId: body.transportistaId,
        tipoGastoId: body.tipoGastoId,
        fecha: new Date(body.fecha),
        importe: Number(body.importe),
        observaciones: body.observaciones || null,
        comprobanteUrl: body.comprobanteUrl || null,
        usuarioId: user?.id || null,
      },
      include: includeAnticipo,
    });
  }

  @Roles("LIQUIDACIONES", "OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateAnticipoDto) {
    const actual = await this.prisma.anticipoGasto.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Anticipo/gasto no encontrado");
    if (actual.liquidado) {
      throw new BadRequestException("No se puede modificar un anticipo/gasto ya liquidado");
    }
    const data: any = { ...body };
    delete data.liquidado;
    delete data.anulado;
    delete data.anuladoMotivo;
    if (data.fecha) data.fecha = new Date(data.fecha);
    if (data.importe !== undefined) data.importe = Number(data.importe);
    return this.prisma.anticipoGasto.update({ where: { id }, data, include: includeAnticipo });
  }

  @Roles("LIQUIDACIONES", "OPERACIONES", "ADMINISTRADOR")
  @Post(":id/anular")
  async anular(@Param("id") id: string, @Body() body: AnularAnticipoDto) {
    const actual = await this.prisma.anticipoGasto.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Anticipo/gasto no encontrado");
    if (actual.liquidado) {
      throw new BadRequestException("No se puede anular un anticipo/gasto ya liquidado");
    }
    if (!body?.motivo) throw new BadRequestException("Debe indicar un motivo de anulación");
    return this.prisma.anticipoGasto.update({
      where: { id },
      data: { anulado: true, anuladoMotivo: body.motivo },
      include: includeAnticipo,
    });
  }
}
