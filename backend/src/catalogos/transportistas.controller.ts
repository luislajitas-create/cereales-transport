import { Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTransportistaDto } from "./dto/create-transportista.dto";
import { UpdateTransportistaDto } from "./dto/update-transportista.dto";

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
  create(@Body() body: CreateTransportistaDto) {
    return this.prisma.transportista.create({ data: body });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateTransportistaDto) {
    return this.prisma.transportista.update({ where: { id }, data: body });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.transportista.update({ where: { id }, data: { activo: false } });
  }

  @Get("export/excel")
  async exportarExcel(@Res() res: Response) {
    const transportistas = await this.prisma.transportista.findMany({
      include: { choferes: true, vehiculos: true },
      orderBy: { razonSocial: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transportistas");

    sheet.addRow(["Listado de Transportistas"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Razón Social", "CUIT", "Domicilio", "Estado", "Choferes", "Vehículos"]);
    header.font = { bold: true };

    for (const t of transportistas) {
      sheet.addRow([
        t.razonSocial,
        t.cuit,
        t.domicilio || "-",
        t.activo ? "Activo" : "Inactivo",
        t.choferes.length,
        t.vehiculos.length,
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 18; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="transportistas-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(@Res() res: Response) {
    const transportistas = await this.prisma.transportista.findMany({
      include: { choferes: true, vehiculos: true },
      orderBy: { razonSocial: "asc" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="transportistas-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Listado de Transportistas", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Razón Social", "CUIT", "Domicilio", "Estado", "Choferes", "Vehículos"]];
    for (const t of transportistas) {
      tableData.push([
        t.razonSocial,
        t.cuit,
        t.domicilio || "-",
        t.activo ? "Activo" : "Inactivo",
        String(t.choferes.length),
        String(t.vehiculos.length),
      ]);
    }

    doc.fontSize(8);
    const colWidths = [90, 70, 80, 50, 50, 50];
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
}
