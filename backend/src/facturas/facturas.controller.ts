import {
  Body, Controller, Get, Param, Post, Query, Res, UseGuards, BadRequestException, ConflictException, NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFacturaDto } from "./dto/create-factura.dto";
import { RegistrarCobranzaDto } from "./dto/registrar-cobranza.dto";
import { AnularCobranzaDto } from "./dto/anular-cobranza.dto";

const TOLERANCIA_REDONDEO = 0.01;

function calcularEstadoFactura(importeFactura: number, totalCobradoVigente: number): "FACTURADO" | "COBRADO_PARCIAL" | "COBRADO_TOTAL" {
  if (totalCobradoVigente >= importeFactura) return "COBRADO_TOTAL";
  if (totalCobradoVigente > 0) return "COBRADO_PARCIAL";
  return "FACTURADO";
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

const includeFactura = {
  cliente: true,
  viajes: { include: { viaje: { include: { cereal: true, origen: true, destino: true, transportista: true } } } },
  cobranzas: { orderBy: { fecha: "asc" as const } },
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("facturas")
export class FacturasController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("clienteId") clienteId?: string,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const where: any = {};
    if (clienteId) where.clienteId = clienteId;
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    return this.prisma.factura.findMany({ where, include: includeFactura, orderBy: { fecha: "desc" } });
  }

  @Get("export/excel")
  async exportarExcel(
    @Query("clienteId") clienteId?: string,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Res() res?: Response,
  ) {
    const where: any = {};
    if (clienteId) where.clienteId = clienteId;
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    const facturas = await this.prisma.factura.findMany({
      where,
      include: includeFactura,
      orderBy: { fecha: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Facturas");

    sheet.addRow(["Consulta de Facturas"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Número", "Fecha", "Cliente", "Vencimiento", "Importe", "Estado", "Viajes"]);
    header.font = { bold: true };

    for (const f of facturas) {
      const viajesStr = f.viajes.map((fv) => fv.viaje.ctg).join("; ");
      sheet.addRow([
        f.numero,
        new Date(f.fecha).toLocaleDateString("es-AR"),
        f.cliente?.razonSocial || "-",
        new Date(f.vencimiento).toLocaleDateString("es-AR"),
        fmtMoney(f.importe),
        f.estado,
        viajesStr || "-",
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="facturas-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(
    @Query("clienteId") clienteId?: string,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Res() res?: Response,
  ) {
    const where: any = {};
    if (clienteId) where.clienteId = clienteId;
    if (estado) where.estado = estado;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }
    const facturas = await this.prisma.factura.findMany({
      where,
      include: includeFactura,
      orderBy: { fecha: "desc" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="facturas-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Consulta de Facturas", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Número", "Fecha", "Cliente", "Vencimiento", "Importe", "Estado", "Viajes"]];
    for (const f of facturas) {
      const viajesStr = f.viajes.map((fv) => fv.viaje.ctg).join("; ");
      tableData.push([
        f.numero,
        new Date(f.fecha).toLocaleDateString("es-AR"),
        f.cliente?.razonSocial || "-",
        new Date(f.vencimiento).toLocaleDateString("es-AR"),
        fmtMoney(f.importe),
        f.estado,
        viajesStr || "-",
      ]);
    }

    doc.fontSize(8);
    const colWidths = [50, 50, 80, 60, 60, 50, 80];
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

  // Conciliación: compara, por cliente y período, los viajes DESCARGADOS (realizados)
  // contra los viajes efectivamente facturados, para detectar viajes pendientes de facturar.
  @Get("conciliacion")
  async conciliacion(
    @Query("clienteId") clienteId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const whereViaje: any = { estado: "DESCARGADO" };
    if (clienteId) whereViaje.clienteId = clienteId;
    if (desde || hasta) {
      whereViaje.fecha = {};
      if (desde) whereViaje.fecha.gte = new Date(desde);
      if (hasta) whereViaje.fecha.lte = new Date(hasta);
    }

    const viajes = await this.prisma.viaje.findMany({
      where: whereViaje,
      include: { cliente: true, cereal: true, origen: true, destino: true },
      orderBy: { fecha: "asc" },
    });

    const porCliente = new Map<string, any>();
    for (const v of viajes) {
      const key = v.clienteId;
      if (!porCliente.has(key)) {
        porCliente.set(key, {
          clienteId: v.clienteId,
          cliente: v.cliente.razonSocial,
          toneladasRealizadas: 0,
          importeRealizado: 0,
          toneladasFacturadas: 0,
          importeFacturado: 0,
          viajesPendientes: [] as any[],
        });
      }
      const acc = porCliente.get(key);
      acc.toneladasRealizadas += v.toneladas;
      acc.importeRealizado += v.importeTotal;
      if (v.estadoFacturacion !== "PENDIENTE_DE_FACTURAR") {
        acc.toneladasFacturadas += v.toneladas;
        acc.importeFacturado += v.importeTotal;
      } else {
        acc.viajesPendientes.push({
          id: v.id,
          numeroViaje: v.numeroViaje,
          fecha: v.fecha,
          ctg: v.ctg,
          cereal: v.cereal.nombre,
          origen: v.origen.nombre,
          destino: v.destino.nombre,
          toneladas: v.toneladas,
          importeTotal: v.importeTotal,
        });
      }
    }

    return Array.from(porCliente.values()).map((r) => ({
      ...r,
      diferenciaToneladas: r.toneladasRealizadas - r.toneladasFacturadas,
      diferenciaImporte: r.importeRealizado - r.importeFacturado,
    }));
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const factura = await this.prisma.factura.findUnique({ where: { id }, include: includeFactura });
    if (!factura) throw new NotFoundException("Factura no encontrada");
    return factura;
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateFacturaDto) {
    const { clienteId, numero, fecha, vencimiento, viajeIds } = body;
    if (!clienteId || !numero || !fecha || !vencimiento) {
      throw new BadRequestException("clienteId, numero, fecha y vencimiento son obligatorios");
    }
    if (!Array.isArray(viajeIds) || viajeIds.length === 0) {
      throw new BadRequestException("Debe incluir al menos un viaje");
    }

    const cliente = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException("Cliente no encontrado.");
    if (!cliente.activo) {
      throw new BadRequestException("El cliente seleccionado está dado de baja. Reactívelo antes de crear la factura.");
    }

    const viajes = await this.prisma.viaje.findMany({
      where: {
        id: { in: viajeIds },
        clienteId,
        estado: "DESCARGADO",
        estadoFacturacion: "PENDIENTE_DE_FACTURAR",
      },
    });
    if (viajes.length !== viajeIds.length) {
      throw new BadRequestException(
        "Alguno de los viajes seleccionados no existe, no está DESCARGADO, ya fue facturado o no corresponde al cliente indicado",
      );
    }

    const importe = viajes.reduce((acc, v) => acc + v.importeTotal, 0);

    return this.prisma.$transaction(async (tx) => {
      const factura = await tx.factura.create({
        data: {
          clienteId,
          numero,
          fecha: new Date(fecha),
          vencimiento: new Date(vencimiento),
          importe,
        },
      });
      for (const v of viajes) {
        const { count } = await tx.viaje.updateMany({
          where: { id: v.id, estadoFacturacion: "PENDIENTE_DE_FACTURAR" },
          data: { estadoFacturacion: "FACTURADO" },
        });
        if (count === 0) {
          throw new BadRequestException(
            "Uno de los viajes seleccionados ya fue facturado por otra operación en curso",
          );
        }
        await tx.facturaViaje.create({
          data: { facturaId: factura.id, viajeId: v.id, importeViaje: v.importeTotal },
        });
      }
      return tx.factura.findUnique({ where: { id: factura.id }, include: includeFactura });
    });
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post(":id/anular")
  async anular(@Param("id") id: string) {
    const factura = await this.prisma.factura.findUnique({ where: { id }, include: { viajes: true, cobranzas: true } });
    if (!factura) throw new NotFoundException("Factura no encontrada");
    if (factura.cobranzas.some((c) => !c.anulada)) {
      throw new BadRequestException("No se puede anular una factura con cobranzas vigentes registradas");
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.factura.update({ where: { id }, data: { estado: "ANULADO" } });
      for (const fv of factura.viajes) {
        await tx.viaje.update({ where: { id: fv.viajeId }, data: { estadoFacturacion: "PENDIENTE_DE_FACTURAR" } });
      }
      return tx.factura.findUnique({ where: { id }, include: includeFactura });
    });
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post(":id/cobranzas")
  async registrarCobranza(@Param("id") id: string, @Body() body: RegistrarCobranzaDto) {
    if (!body.fecha || body.importe === undefined) {
      throw new BadRequestException("fecha e importe son obligatorios");
    }
    const importeNuevo = Number(body.importe);
    const fechaNueva = new Date(body.fecha);
    const medioPagoNuevo = body.medioPago || null;

    return this.prisma.$transaction(async (tx) => {
      // Bloquea la fila de la factura durante toda la transacción para que dos cobranzas
      // concurrentes sobre la misma factura no lean el mismo saldo "disponible" a la vez
      // (el updateMany condicionado de otros bloques no alcanza acá: el tope depende de la
      // suma de varias filas de Cobranza, no del estado de una sola fila).
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${id} FOR UPDATE`;

      const factura = await tx.factura.findUnique({ where: { id }, include: { cobranzas: true } });
      if (!factura) throw new NotFoundException("Factura no encontrada");
      if (factura.estado === "ANULADO") throw new BadRequestException("La factura está anulada");

      const vigentes = factura.cobranzas.filter((c) => !c.anulada);
      const totalCobradoVigente = vigentes.reduce((acc, c) => acc + c.importe, 0);

      const duplicada = vigentes.some(
        (c) => new Date(c.fecha).getTime() === fechaNueva.getTime() && c.importe === importeNuevo && (c.medioPago || null) === medioPagoNuevo,
      );
      if (duplicada) {
        throw new ConflictException(
          "Ya existe una cobranza vigente idéntica (misma fecha, importe y medio de pago) para esta factura",
        );
      }

      if (totalCobradoVigente + importeNuevo > factura.importe + TOLERANCIA_REDONDEO) {
        throw new BadRequestException(
          `El importe supera el saldo pendiente de la factura: saldo actual ${factura.importe - totalCobradoVigente}, intentado ${importeNuevo}.`,
        );
      }

      await tx.cobranza.create({
        data: {
          facturaId: id,
          fecha: fechaNueva,
          importe: importeNuevo,
          medioPago: medioPagoNuevo,
          observacion: body.observacion || null,
        },
      });
      const nuevoEstado = calcularEstadoFactura(factura.importe, totalCobradoVigente + importeNuevo);
      await tx.factura.update({ where: { id }, data: { estado: nuevoEstado } });
      return tx.factura.findUnique({ where: { id }, include: includeFactura });
    });
  }

  @Roles("FACTURACION", "ADMINISTRADOR")
  @Post(":id/cobranzas/:cobranzaId/anular")
  async anularCobranza(
    @Param("id") id: string,
    @Param("cobranzaId") cobranzaId: string,
    @Body() body: AnularCobranzaDto,
    @CurrentUser() user: any,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Factura" WHERE id = ${id} FOR UPDATE`;

      const factura = await tx.factura.findUnique({ where: { id }, include: { cobranzas: true } });
      if (!factura) throw new NotFoundException("Factura no encontrada");

      const cobranza = factura.cobranzas.find((c) => c.id === cobranzaId);
      if (!cobranza) throw new NotFoundException("Cobranza no encontrada para esta factura");
      if (cobranza.anulada) throw new BadRequestException("La cobranza ya está anulada");

      const anuladaFecha = new Date();
      await tx.cobranza.update({
        where: { id: cobranzaId },
        data: { anulada: true, anuladaMotivo: body.motivo || null, anuladaFecha },
      });
      await tx.auditLog.create({
        data: {
          usuarioId: user?.id || null,
          entidad: "Cobranza",
          entidadId: cobranzaId,
          accion: "anular",
          datosAnteriores: { importe: cobranza.importe, fecha: cobranza.fecha, medioPago: cobranza.medioPago },
          datosNuevos: { anulada: true, motivo: body.motivo || null },
        },
      });

      const totalCobradoVigente = factura.cobranzas
        .filter((c) => !c.anulada && c.id !== cobranzaId)
        .reduce((acc, c) => acc + c.importe, 0);
      const nuevoEstado = calcularEstadoFactura(factura.importe, totalCobradoVigente);
      await tx.factura.update({ where: { id }, data: { estado: nuevoEstado } });
      return tx.factura.findUnique({ where: { id }, include: includeFactura });
    });
  }
}
