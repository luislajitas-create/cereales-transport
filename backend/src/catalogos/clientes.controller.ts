import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClienteDto } from "./dto/create-cliente.dto";
import { UpdateClienteDto } from "./dto/update-cliente.dto";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clientes")
export class ClientesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.cliente.findMany({ include: { contactos: true }, orderBy: { razonSocial: "asc" } });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.cliente.findUnique({ where: { id }, include: { contactos: true } });
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateClienteDto) {
    const { contactos, ...data } = body;
    return this.prisma.cliente.create({
      data: { ...data, contactos: contactos ? { create: contactos } : undefined },
      include: { contactos: true },
    });
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateClienteDto) {
    const { contactos, ...data } = body;
    return this.prisma.cliente.update({ where: { id }, data });
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.cliente.update({ where: { id }, data: { activo: false } });
  }

  @Get("export/excel")
  async exportarExcel(@Res() res: Response) {
    const clientes = await this.prisma.cliente.findMany({
      include: { contactos: true },
      orderBy: { razonSocial: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Clientes");

    sheet.addRow(["Listado de Clientes"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Razón Social", "CUIT", "Estado", "Fecha Creación", "Contactos"]);
    header.font = { bold: true };

    for (const c of clientes) {
      const contactosStr = c.contactos.map((ct) => ct.nombre).join("; ");
      sheet.addRow([
        c.razonSocial,
        c.cuit,
        c.activo ? "Activo" : "Inactivo",
        new Date(c.createdAt).toLocaleDateString("es-AR"),
        contactosStr || "-",
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 20; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(@Res() res: Response) {
    const clientes = await this.prisma.cliente.findMany({
      include: { contactos: true },
      orderBy: { razonSocial: "asc" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="clientes-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Listado de Clientes", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Razón Social", "CUIT", "Estado", "Fecha", "Contactos"]];
    for (const c of clientes) {
      const contactosStr = c.contactos.map((ct) => ct.nombre).join("; ");
      tableData.push([
        c.razonSocial,
        c.cuit,
        c.activo ? "Activo" : "Inactivo",
        new Date(c.createdAt).toLocaleDateString("es-AR"),
        contactosStr || "-",
      ]);
    }

    doc.fontSize(8);
    const colWidths = [90, 70, 50, 60, 100];
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

  @Get(":id/cuenta-corriente")
  async cuentaCorriente(@Param("id") id: string) {
    const facturas = await this.prisma.factura.findMany({
      where: { clienteId: id },
      include: { cobranzas: { where: { anulada: false } } },
      orderBy: { fecha: "asc" },
    });
    const raw: any[] = [];
    for (const f of facturas) {
      raw.push({ fecha: f.fecha, concepto: `Factura ${f.numero}`, debe: f.importe, haber: 0 });
      for (const c of f.cobranzas) {
        raw.push({ fecha: c.fecha, concepto: `Cobranza factura ${f.numero}`, debe: 0, haber: c.importe });
      }
    }
    raw.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    let saldo = 0;
    const movimientos = raw.map((m) => {
      saldo += m.debe - m.haber;
      return { ...m, saldo };
    });
    return { movimientos, saldoActual: saldo };
  }
}
