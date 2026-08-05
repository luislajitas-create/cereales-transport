import {
  BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
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
import { parsearCsv, filasComoObjetos, validarEncabezados, LIMITE_FILAS_IMPORTACION_CSV } from "../common/csv";
import { mensajeErrorImportacion } from "../common/importacion-errores";
import { normalizarCuit, normalizarCuil, normalizarDni } from "../common/normalizacion";
import { CreateChoferDto } from "./dto/create-chofer.dto";
import { UpdateChoferDto } from "./dto/update-chofer.dto";

// CAT-2: mismas columnas de CreateChoferDto, salvo "transportistaId" — la plantilla nunca expone
// IDs internos (auditoría CAT-2): se resuelve por el CUIT del transportista, clave comercial
// estable y única por organización (Transportista.cuit, @@unique([organizacionId, cuit])).
const PLANTILLA_CHOFERES_CSV =
  'transportistaCuit,nombre,dni,cuil,comisionPct,licenciaNumero,licenciaVencimiento,telefono\n' +
  '30-12345678-9,"Juan Perez",30123456,20-30123456-4,5,B1234567,2027-05-01,+54 9 11 1234-5678\n';

// CAT-2: columnas sin las cuales ninguna fila podría procesarse (transportistaCuit resuelve la
// relación, nombre y cuil son @IsNotEmpty en CreateChoferDto). Se valida el ENCABEZADO antes de
// leer una sola fila — un CSV al que directamente le falta la columna "cuil" se rechaza completo
// con un mensaje claro, en vez de rechazar cada fila una por una con "cuil should not be empty".
const ENCABEZADOS_OBLIGATORIOS_CHOFERES = ["transportistaCuit", "nombre", "cuil"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("choferes")
export class ChoferesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  // CAT-2: declarado antes de cualquier ruta con :id — "importar" no debe interpretarse como un id.
  // Misma matriz de roles que importar() — la plantilla revela nombres de columnas del dominio,
  // no datos, pero se restringe igual para no ofrecer a un rol sin acceso un mapa de qué se puede
  // cargar.
  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Get("importar/plantilla")
  plantillaImportacion(@Res() res: Response) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-choferes.csv"',
    });
    res.send(PLANTILLA_CHOFERES_CSV);
  }

  // CAT-2 (importación masiva de Choferes): mismo criterio de CAT-1 (parser compartido,
  // resultado parcial por fila, sin rollback de archivo) con dos agregados propios de este
  // bloque:
  //   1. La plantilla no lleva transportistaId — se resuelve por CUIT (clave comercial estable).
  //      Un CUIT inexistente O de otra organización se rechaza igual (findMany ya viene acotado
  //      a esta organización por la extensión de aislamiento — nunca se distingue "no existe" de
  //      "es de otra organización": decirlo sería filtrar información entre organizaciones).
  //   2. Duplicados de CUIL se detectan en LOTE (una sola consulta a la base, no una por fila) y
  //      también dentro del propio archivo — no se crea un chofer duplicado ni se convierte
  //      silenciosamente la importación en una edición: la fila se rechaza con un mensaje que
  //      distingue "ya existe en la base" de "duplicado dentro del archivo".
  // El alta individual de Chofer (create() más abajo) no genera AuditLog — la importación
  // tampoco genera uno: sigue exactamente la misma política vigente (Bloque de auditoría
  // verificado en el diagnóstico de CAT-2, no se amplía acá).
  @Roles("OPERACIONES", "LIQUIDACIONES", "ADMINISTRADOR")
  @Post("importar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importar(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException("Debe adjuntar un archivo CSV en el campo 'archivo'.");
    const filasCrudas = parsearCsv(archivo.buffer.toString("utf-8"));
    if (filasCrudas.length === 0) throw new BadRequestException("El archivo está vacío.");

    // CAT-2: el archivo se rechaza COMPLETO, antes de leer una sola fila de datos y antes de
    // cualquier consulta o escritura, si el encabezado es inválido o si excede el límite de
    // filas — nunca se procesa parcialmente un archivo mal formado.
    const errorEncabezados = validarEncabezados(filasCrudas[0], ENCABEZADOS_OBLIGATORIOS_CHOFERES);
    if (errorEncabezados) throw new BadRequestException(errorEncabezados);

    const filasDeDatos = filasCrudas.length - 1;
    if (filasDeDatos === 0) throw new BadRequestException("El archivo no tiene filas de datos para importar.");
    if (filasDeDatos > LIMITE_FILAS_IMPORTACION_CSV) {
      throw new BadRequestException(
        `El archivo supera el límite de ${LIMITE_FILAS_IMPORTACION_CSV} filas de datos (tiene ${filasDeDatos}).`,
      );
    }

    const filas = filasComoObjetos(filasCrudas);

    // Resolución en lote (CAT-2, rendimiento): una consulta para transportistas por CUIT, una
    // para choferes existentes por CUIL/DNI — nunca una consulta por fila. Ambas ya acotadas a la
    // organización activa por la extensión de aislamiento (Bloque 8.1.d).
    // CAT-3: se normaliza (no solo .trim()) ANTES de armar las claves de consulta — el CUIT
    // almacenado en Transportista ya es canónico (mismo DTO normalizado), así que la clave de
    // búsqueda tiene que serlo también o un CSV con guiones nunca resolvería el transportista.
    const cuitsDelArchivo = Array.from(new Set(filas.map((f) => normalizarCuit(f.transportistaCuit || "")).filter(Boolean)));
    const transportistas = cuitsDelArchivo.length
      ? await this.prisma.transportista.findMany({ where: { cuit: { in: cuitsDelArchivo } }, select: { id: true, cuit: true } })
      : [];
    const idPorCuit = new Map(transportistas.map((t) => [t.cuit, t.id]));

    // CAT-2: CUIL y DNI son las dos restricciones @@unique reales de Chofer, además de id —
    // ambas se resuelven en UNA sola consulta batch (OR combinado, no dos consultas separadas).
    // DNI es opcional en el modelo (dni String?): solo se valida cuando la fila lo trae, porque
    // varios choferes sin DNI son válidos (NULL no colisiona consigo mismo en la restricción
    // única de Postgres). CAT-3: normalizado antes de armar la clave — mismo motivo que arriba.
    const cuilsDelArchivo = Array.from(new Set(filas.map((f) => normalizarCuil(f.cuil || "")).filter(Boolean)));
    const dnisDelArchivo = Array.from(new Set(filas.map((f) => normalizarDni(f.dni || "") || "").filter(Boolean)));
    const filtrosDuplicados: Array<Record<string, unknown>> = [];
    if (cuilsDelArchivo.length) filtrosDuplicados.push({ cuil: { in: cuilsDelArchivo } });
    if (dnisDelArchivo.length) filtrosDuplicados.push({ dni: { in: dnisDelArchivo } });
    const existentes = filtrosDuplicados.length
      ? await this.prisma.chofer.findMany({ where: { OR: filtrosDuplicados }, select: { cuil: true, dni: true } })
      : [];
    const cuilsEnBase = new Set(existentes.map((c) => c.cuil));
    const dnisEnBase = new Set(existentes.filter((c) => c.dni).map((c) => c.dni as string));
    const cuilsVistosEnArchivo = new Set<string>();
    const dnisVistosEnArchivo = new Set<string>();

    const detalle: { fila: number; ok: boolean; mensaje: string }[] = [];
    let creados = 0;
    for (let i = 0; i < filas.length; i++) {
      const numeroFila = i + 2; // fila 1 es el encabezado
      const registro = filas[i];

      const cuitTransportista = normalizarCuit(registro.transportistaCuit || "");
      if (!cuitTransportista) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: "transportistaCuit es obligatorio." });
        continue;
      }
      const transportistaId = idPorCuit.get(cuitTransportista);
      if (!transportistaId) {
        detalle.push({
          fila: numeroFila,
          ok: false,
          mensaje: `No existe un transportista con CUIT '${cuitTransportista}' en esta organización.`,
        });
        continue;
      }

      const dto = plainToInstance(CreateChoferDto, {
        transportistaId,
        nombre: registro.nombre,
        dni: registro.dni || undefined,
        cuil: registro.cuil,
        comisionPct: registro.comisionPct || undefined,
        licenciaNumero: registro.licenciaNumero || undefined,
        licenciaVencimiento: registro.licenciaVencimiento || undefined,
        telefono: registro.telefono || undefined,
      });
      const errores = await validate(dto);
      if (errores.length > 0) {
        const mensaje = errores.flatMap((e) => Object.values(e.constraints || {})).join("; ");
        detalle.push({ fila: numeroFila, ok: false, mensaje });
        continue;
      }

      if (cuilsEnBase.has(dto.cuil)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `Ya existe un chofer con CUIL '${dto.cuil}' en esta organización.` });
        continue;
      }
      if (dto.dni && dnisEnBase.has(dto.dni)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `Ya existe un chofer con DNI '${dto.dni}' en esta organización.` });
        continue;
      }
      if (cuilsVistosEnArchivo.has(dto.cuil)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `CUIL '${dto.cuil}' duplicado dentro del archivo.` });
        continue;
      }
      if (dto.dni && dnisVistosEnArchivo.has(dto.dni)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `DNI '${dto.dni}' duplicado dentro del archivo.` });
        continue;
      }
      cuilsVistosEnArchivo.add(dto.cuil);
      if (dto.dni) dnisVistosEnArchivo.add(dto.dni);

      try {
        await this.prisma.chofer.create({
          data: {
            transportistaId: dto.transportistaId,
            nombre: dto.nombre,
            dni: dto.dni || null,
            cuil: dto.cuil,
            comisionPct: dto.comisionPct ?? undefined,
            licenciaNumero: dto.licenciaNumero || null,
            licenciaVencimiento: dto.licenciaVencimiento ? new Date(dto.licenciaVencimiento) : null,
            telefono: dto.telefono || null,
          },
        });
        creados++;
        detalle.push({ fila: numeroFila, ok: true, mensaje: "Creado correctamente." });
      } catch (error) {
        // CAT-2: última defensa ante concurrencia (dos filas o dos importaciones simultáneas
        // apuntando al mismo CUIL/DNI). Nunca se devuelve error.message crudo — ver
        // mensajeErrorImportacion.
        detalle.push({ fila: numeroFila, ok: false, mensaje: mensajeErrorImportacion(error) });
      }
    }
    return { total: filas.length, creados, rechazados: filas.length - creados, detalle };
  }

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
  async findOne(@Param("id") id: string) {
    const chofer = await this.prisma.chofer.findUnique({ where: { id } });
    return encontrarOFallar(chofer, "Chofer no encontrado.");
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
