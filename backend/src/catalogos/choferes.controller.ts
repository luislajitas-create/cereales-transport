import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateChoferDto } from "./dto/create-chofer.dto";
import { UpdateChoferDto } from "./dto/update-chofer.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("choferes")
export class ChoferesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(
    @Query("transportistaId") transportistaId?: string,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    const where: any = {};
    if (transportistaId) where.transportistaId = transportistaId;
    if (incluirInactivos !== "true") where.activo = true;
    return this.prisma.chofer.findMany({ where, orderBy: { nombre: "asc" } });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.prisma.chofer.findUnique({ where: { id } });
  }

  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateChoferDto) {
    return this.prisma.chofer.create({ data: body });
  }

  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateChoferDto) {
    return this.prisma.chofer.update({ where: { id }, data: body });
  }

  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.chofer.update({ where: { id }, data: { activo: false } });
  }

  @Get("export/excel")
  async exportarExcel(@Res() res: Response) {
    const choferes = await this.prisma.chofer.findMany({
      include: { transportista: true },
      orderBy: { nombre: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Choferes");

    sheet.addRow(["Listado de Choferes"]);
    sheet.addRow([]);

    const header = sheet.addRow(["Nombre", "DNI", "CUIL", "Transportista", "Comisión %", "Licencia", "Teléfono"]);
    header.font = { bold: true };

    for (const ch of choferes) {
      sheet.addRow([
        ch.nombre,
        ch.dni || "-",
        ch.cuil,
        ch.transportista?.razonSocial || "-",
        ch.comisionPct,
        ch.licenciaNumero || "-",
        ch.telefono || "-",
      ]);
    }

    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="choferes-${new Date().toISOString().split("T")[0]}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get("export/pdf")
  async exportarPdf(@Res() res: Response) {
    const choferes = await this.prisma.chofer.findMany({
      include: { transportista: true },
      orderBy: { nombre: "asc" },
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="choferes-${new Date().toISOString().split("T")[0]}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text("Listado de Choferes", { align: "center" });
    doc.fontSize(10).text(`Generado el ${new Date().toLocaleDateString("es-AR")}`, { align: "center" });
    doc.moveDown();

    const tableData = [["Nombre", "DNI", "CUIL", "Transportista", "Comisión %", "Licencia", "Teléfono"]];
    for (const ch of choferes) {
      tableData.push([
        ch.nombre,
        ch.dni || "-",
        ch.cuil,
        ch.transportista?.razonSocial || "-",
        String(ch.comisionPct),
        ch.licenciaNumero || "-",
        ch.telefono || "-",
      ]);
    }

    doc.fontSize(8);
    const colWidths = [70, 50, 60, 80, 50, 60, 60];
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
