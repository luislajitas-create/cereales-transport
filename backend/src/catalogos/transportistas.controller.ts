import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { encontrarOFallar } from "../common/encontrar-o-fallar";
import { parsearCsv, filasComoObjetos } from "../common/csv";
import { CreateTransportistaDto } from "./dto/create-transportista.dto";
import { UpdateTransportistaDto } from "./dto/update-transportista.dto";

// CAT-1: mismas columnas de CreateTransportistaDto. Encabezados exactos esperados en el CSV.
const PLANTILLA_TRANSPORTISTAS_CSV = 'razonSocial,cuit,domicilio\n"Transportista Ejemplo S.A.",30-12345678-9,"Av. Siempre Viva 123"\n';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("transportistas")
export class TransportistasController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  findAll(@Query("incluirInactivos") incluirInactivos?: string) {
    return this.prisma.transportista.findMany({
      where: incluirInactivos === "true" ? undefined : { activo: true },
      include: { choferes: true, vehiculos: true },
      orderBy: { razonSocial: "asc" },
    });
  }

  // CAT-1: declarado antes de @Get(":id") — "importar" no debe interpretarse como un id.
  @Get("importar/plantilla")
  plantillaImportacion(@Res() res: Response) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-transportistas.csv"',
    });
    res.send(PLANTILLA_TRANSPORTISTAS_CSV);
  }

  // CAT-1 (importación masiva): mismo criterio que ClientesController.importar() — valida cada
  // fila con CreateTransportistaDto (mismo DTO del alta individual), no bloquea el archivo
  // completo ante una fila inválida, no verifica CUIT duplicado (tampoco lo hace create() hoy;
  // cuit no es @unique en el schema).
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post("importar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importar(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException("Debe adjuntar un archivo CSV en el campo 'archivo'.");
    const filas = filasComoObjetos(parsearCsv(archivo.buffer.toString("utf-8")));
    if (filas.length === 0) throw new BadRequestException("El archivo no tiene filas de datos para importar.");

    const detalle: { fila: number; ok: boolean; mensaje: string }[] = [];
    let creados = 0;
    for (let i = 0; i < filas.length; i++) {
      const numeroFila = i + 2;
      const registro = filas[i];
      const dto = plainToInstance(CreateTransportistaDto, {
        razonSocial: registro.razonSocial,
        cuit: registro.cuit,
        domicilio: registro.domicilio || undefined,
      });
      const errores = await validate(dto);
      if (errores.length > 0) {
        const mensaje = errores.flatMap((e) => Object.values(e.constraints || {})).join("; ");
        detalle.push({ fila: numeroFila, ok: false, mensaje });
        continue;
      }
      try {
        await this.prisma.transportista.create({
          data: { razonSocial: dto.razonSocial, cuit: dto.cuit, domicilio: dto.domicilio || null },
        });
        creados++;
        detalle.push({ fila: numeroFila, ok: true, mensaje: "Creado correctamente." });
      } catch (error) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: error instanceof Error ? error.message : "Error desconocido al crear." });
      }
    }
    return { total: filas.length, creados, rechazados: filas.length - creados, detalle };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const transportista = await this.prisma.transportista.findUnique({
      where: { id },
      include: { choferes: true, vehiculos: true },
    });
    return encontrarOFallar(transportista, "Transportista no encontrado.");
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateTransportistaDto) {
    return this.prisma.transportista.create({ data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateTransportistaDto) {
    return this.prisma.transportista.update({ where: { id }, data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
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
