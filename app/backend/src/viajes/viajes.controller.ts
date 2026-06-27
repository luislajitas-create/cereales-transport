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

const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

const includeViaje = {
  cereal: true, cliente: true, productor: true, transportista: true, chofer: true,
  camion: true, acoplado: true, origen: true, destino: true,
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

async function obtenerViajesFiltrados(prisma: PrismaService, filtros: any) {
  const where: any = {};
  if (filtros.desde || filtros.hasta) {
    where.fecha = {};
    if (filtros.desde) where.fecha.gte = new Date(filtros.desde);
    if (filtros.hasta) where.fecha.lte = new Date(filtros.hasta);
  }
  if (filtros.clienteId) where.clienteId = filtros.clienteId;
  if (filtros.transportistaId) where.transportistaId = filtros.transportistaId;
  if (filtros.choferId) where.choferId = filtros.choferId;
  if (filtros.productorId) where.productorId = filtros.productorId;
  if (filtros.cerealId) where.cerealId = filtros.cerealId;
  if (filtros.origenId) where.origenId = filtros.origenId;
  if (filtros.destinoId) where.destinoId = filtros.destinoId;
  if (filtros.estado) where.estado = filtros.estado;
  if (filtros.cartaPorte) where.cartaPorte = { contains: filtros.cartaPorte };
  if (filtros.ctg) where.ctg = { contains: filtros.ctg };

  return prisma.viaje.findMany({ where, include: includeViaje, orderBy: { fecha: "desc" } });
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("viajes")
export class ViajesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("choferId") choferId?: string,
    @Query("productorId") productorId?: string,
    @Query("cerealId") cerealId?: string,
    @Query("origenId") origenId?: string,
    @Query("destinoId") destinoId?: string,
    @Query("estado") estado?: string,
    @Query("cartaPorte") cartaPorte?: string,
    @Query("ctg") ctg?: string,
  ) {
    const filtros = { desde, hasta, clienteId, transportistaId, choferId, productorId, cerealId, origenId, destinoId, estado, cartaPorte, ctg };
    return obtenerViajesFiltrados(this.prisma, filtros);
  }

  @Get("export/excel")
  async exportarExcel(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("choferId") choferId?: string,
    @Query("productorId") productorId?: string,
    @Query("cerealId") cerealId?: string,
    @Query("origenId") origenId?: string,
    @Query("destinoId") destinoId?: string,
    @Query("estado") estado?: string,
    @Query("cartaPorte") cartaPorte?: string,
    @Query("ctg") ctg?: string,
    @Res() res: Response,
  ) {
    const filtros = { desde, hasta, clienteId, transportistaId, choferId, productorId, cerealId, origenId, destinoId, estado, cartaPorte, ctg };
    const viajes = await obtenerViajesFiltrados(this.prisma, filtros);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Viajes");

    sheet.addRow(["Consulta de Viajes"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Fecha", "Cliente", "Chofer", "CP", "CTG", "Origen", "Destino", "Toneladas", "Tarifa", "Importe", "Estado"]);
    header.font = { bold: true };

    for (const v of viajes) {
      sheet.addRow([
        new Date(v.fecha).toLocaleDateString("es-AR"),
        v.cliente?.razonSocial || "-",
        v.chofer?.nombre || "-",
        v.cartaPorte || "-",
        v.ctg || "-",
        v.origen?.nombre || "-",
        v.destino?.nombre || "-",
        v.toneladas,
        v.tarifaTonelada,
        v.importeTotal,
        v.estado,
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="viajes-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("clienteId") clienteId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("choferId") choferId?: string,
    @Query("productorId") productorId?: string,
    @Query("cerealId") cerealId?: string,
    @Query("origenId") origenId?: string,
    @Query("destinoId") destinoId?: string,
    @Query("estado") estado?: string,
    @Query("cartaPorte") cartaPorte?: string,
    @Query("ctg") ctg?: string,
    @Res() res: Response,
  ) {
    const filtros = { desde, hasta, clienteId, transportistaId, choferId, productorId, cerealId, origenId, destinoId, estado, cartaPorte, ctg };
    const viajes = await obtenerViajesFiltrados(this.prisma, filtros);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="viajes-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Consulta de Viajes", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Fecha", "Cliente", "Chofer", "CP", "CTG", "Origen", "Destino", "TN", "Tarifa", "Importe", "Estado"]];
    for (const v of viajes) {
      tableData.push([
        new Date(v.fecha).toLocaleDateString("es-AR"),
        v.cliente?.razonSocial || "-",
        v.chofer?.nombre || "-",
        v.cartaPorte || "-",
        v.ctg || "-",
        v.origen?.nombre || "-",
        v.destino?.nombre || "-",
        String(v.toneladas),
        fmtMoney(v.tarifaTonelada),
        fmtMoney(v.importeTotal),
        v.estado,
      ]);
    }

    doc.fontSize(8);
    const colWidths = [50, 70, 50, 40, 40, 45, 45, 30, 50, 60, 60];
    let y = doc.y;

    // Header
    tableData[0].forEach((cell, i) => {
      doc.text(cell, 40 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i], align: "left" });
    });
    y += 15;
    doc.moveTo(40, y).lineTo(550, y).stroke();
    y += 5;

    // Rows
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

  @Get("pendientes-facturar")
  async pendientesFacturar(@Query("clienteId") clienteId?: string) {
    return this.prisma.viaje.findMany({
      where: {
        estado: "DESCARGADO",
        estadoFacturacion: "PENDIENTE_DE_FACTURAR",
        ...(clienteId ? { clienteId } : {}),
      },
      include: includeViaje,
      orderBy: { fecha: "asc" },
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const viaje = await this.prisma.viaje.findUnique({
      where: { id },
      include: {
        ...includeViaje,
        historial: { orderBy: { fecha: "asc" }, include: { usuario: true } },
        anticipos: { include: { tipoGasto: true } },
        liquidacionViaje: { include: { liquidacion: true } },
        facturaViaje: { include: { factura: true } },
      },
    });
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
    return viaje;
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    const importeTotal = Number(body.toneladas) * Number(body.tarifaTonelada);
    const viaje = await this.prisma.viaje.create({
      data: {
        fecha: new Date(body.fecha),
        cartaPorte: body.cartaPorte,
        ctg: body.ctg,
        cerealId: body.cerealId,
        clienteId: body.clienteId,
        productorId: body.productorId || null,
        transportistaId: body.transportistaId,
        choferId: body.choferId,
        camionId: body.camionId,
        acopladoId: body.acopladoId || null,
        origenId: body.origenId,
        destinoId: body.destinoId,
        toneladas: Number(body.toneladas),
        tarifaTonelada: Number(body.tarifaTonelada),
        importeTotal,
        observaciones: body.observaciones || null,
        creadoPorId: user?.id || null,
      },
      include: includeViaje,
    });
    await this.prisma.historialEstadoViaje.create({
      data: { viajeId: viaje.id, estadoAnterior: null, estadoNuevo: "PENDIENTE", usuarioId: user?.id || null },
    });
    return viaje;
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const data: any = { ...body };
    delete data.estado;
    if (data.toneladas || data.tarifaTonelada) {
      const actual = await this.prisma.viaje.findUnique({ where: { id } });
      const toneladas = Number(data.toneladas ?? actual.toneladas);
      const tarifa = Number(data.tarifaTonelada ?? actual.tarifaTonelada);
      data.toneladas = toneladas;
      data.tarifaTonelada = tarifa;
      data.importeTotal = toneladas * tarifa;
    }
    if (data.fecha) data.fecha = new Date(data.fecha);
    return this.prisma.viaje.update({ where: { id }, data, include: includeViaje });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post(":id/estado")
  async cambiarEstado(@Param("id") id: string, @Body() body: { estado: string }, @CurrentUser() user: any) {
    const viaje = await this.prisma.viaje.findUnique({ where: { id } });
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
    if (viaje.estado === "CANCELADO") throw new BadRequestException("El viaje está cancelado");

    const nuevo = body.estado;
    if (nuevo === "CANCELADO") {
      return this.aplicarCambioEstado(viaje, "CANCELADO", user);
    }
    const idxActual = ORDEN_ESTADOS.indexOf(viaje.estado);
    const idxNuevo = ORDEN_ESTADOS.indexOf(nuevo);
    if (idxNuevo === -1) throw new BadRequestException("Estado inválido");
    if (idxNuevo !== idxActual + 1) {
      throw new BadRequestException(
        `No se puede pasar de ${viaje.estado} a ${nuevo} directamente. El siguiente estado válido es ${ORDEN_ESTADOS[idxActual + 1] || "ninguno"}.`,
      );
    }
    return this.aplicarCambioEstado(viaje, nuevo, user);
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post(":id/cancelar")
  async cancelar(@Param("id") id: string, @Body() body: { motivo: string }, @CurrentUser() user: any) {
    const viaje = await this.prisma.viaje.findUnique({ where: { id } });
    if (!viaje) throw new NotFoundException("Viaje no encontrado");
    return this.aplicarCambioEstado(viaje, "CANCELADO", user, body.motivo);
  }

  private async aplicarCambioEstado(viaje: any, nuevo: string, user: any, motivo?: string) {
    const actualizado = await this.prisma.viaje.update({
      where: { id: viaje.id },
      data: { estado: nuevo as any },
      include: includeViaje,
    });
    await this.prisma.historialEstadoViaje.create({
      data: {
        viajeId: viaje.id,
        estadoAnterior: viaje.estado,
        estadoNuevo: nuevo + (motivo ? ` (motivo: ${motivo})` : ""),
        usuarioId: user?.id || null,
      },
    });
    return actualizado;
  }
}