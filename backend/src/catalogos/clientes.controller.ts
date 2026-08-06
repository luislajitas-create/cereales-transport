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
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { encontrarOFallar } from "../common/encontrar-o-fallar";
import { parsearCsv, filasComoObjetos, LIMITE_FILAS_IMPORTACION_CSV } from "../common/csv";
import { mensajeErrorImportacion } from "../common/importacion-errores";
import {
  registrarAuditoria,
  calcularCamposCambiados,
  subconjunto,
  marcarOrigenImportacionCsv,
} from "../common/auditoria";
import { CreateClienteDto } from "./dto/create-cliente.dto";
import { UpdateClienteDto } from "./dto/update-cliente.dto";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// CAT-1: mismas columnas de CreateClienteDto (sin "contactos" — es una relación anidada, no un
// dato plano de fila de CSV; se crea sin contactos, se agregan después individualmente si hace
// falta). Encabezados exactos esperados en el CSV subido.
const PLANTILLA_CLIENTES_CSV = 'razonSocial,cuit,condicionesComerciales\n"Cliente Ejemplo S.A.",30-12345678-9,"Pago a 30 días"\n';

// CAT-4: entidad y allowlist de AuditLog. CUIT queda legible (identificador comercial, no
// personal). organizacionId/id/contactos (relación anidada) quedan afuera a propósito — nunca se
// serializa el objeto Prisma completo, ver AUDITORIA_CATALOGOS.md sección CAT-4.
const ENTIDAD_CLIENTE = "Cliente";
function snapshotCliente(c: { razonSocial: string; cuit: string; condicionesComerciales: string | null; activo: boolean }) {
  return { razonSocial: c.razonSocial, cuit: c.cuit, condicionesComerciales: c.condicionesComerciales, activo: c.activo };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clientes")
export class ClientesController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  findAll(@Query("incluirInactivos") incluirInactivos?: string) {
    return this.prisma.cliente.findMany({
      where: incluirInactivos === "true" ? undefined : { activo: true },
      include: { contactos: true },
      orderBy: { razonSocial: "asc" },
    });
  }

  // CAT-1: declarado antes de @Get(":id") — "importar" no debe interpretarse como un id.
  @Get("importar/plantilla")
  plantillaImportacion(@Res() res: Response) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-clientes.csv"',
    });
    res.send(PLANTILLA_CLIENTES_CSV);
  }

  // CAT-1 (importación masiva): cada fila se valida con el mismo CreateClienteDto que usa el
  // alta individual (misma regla, no se reimplementa nada) y se procesa de forma independiente
  // — una fila inválida o que falle al crear no aborta el archivo completo ni las demás filas
  // válidas. No se verifica CUIT duplicado en lote (a diferencia de Choferes/Vehículos en CAT-2):
  // el alta individual tampoco lo hace hoy. Nota: el schema SÍ tiene
  // @@unique([organizacionId, cuit]) en Cliente — un duplicado sigue rechazándose vía P2002 en el
  // catch de abajo (mensajeErrorImportacion), solo que sin la detección proactiva en lote. Ampliar
  // esto es una mejora futura, fuera del alcance de este cierre.
  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Post("importar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importar(@UploadedFile() archivo: Express.Multer.File | undefined, @CurrentUser() actor: any) {
    if (!archivo) throw new BadRequestException("Debe adjuntar un archivo CSV en el campo 'archivo'.");
    const filasCrudas = parsearCsv(archivo.buffer.toString("utf-8"));
    if (filasCrudas.length === 0) throw new BadRequestException("El archivo está vacío.");
    const filasDeDatos = filasCrudas.length - 1;
    if (filasDeDatos === 0) throw new BadRequestException("El archivo no tiene filas de datos para importar.");
    if (filasDeDatos > LIMITE_FILAS_IMPORTACION_CSV) {
      throw new BadRequestException(
        `El archivo supera el límite de ${LIMITE_FILAS_IMPORTACION_CSV} filas de datos (tiene ${filasDeDatos}).`,
      );
    }
    const filas = filasComoObjetos(filasCrudas);

    const detalle: { fila: number; ok: boolean; mensaje: string }[] = [];
    let creados = 0;
    for (let i = 0; i < filas.length; i++) {
      const numeroFila = i + 2; // fila 1 es el encabezado
      const registro = filas[i];
      const dto = plainToInstance(CreateClienteDto, {
        razonSocial: registro.razonSocial,
        cuit: registro.cuit,
        condicionesComerciales: registro.condicionesComerciales || undefined,
      });
      const errores = await validate(dto);
      if (errores.length > 0) {
        const mensaje = errores.flatMap((e) => Object.values(e.constraints || {})).join("; ");
        detalle.push({ fila: numeroFila, ok: false, mensaje });
        continue;
      }
      try {
        // CAT-4: entidad + AuditLog atómicos por fila (nunca todo el archivo en una sola
        // transacción) — si el auditLog.create() fallara, este create() también se revierte, y
        // la fila queda como rechazada sin dejar un Cliente huérfano sin evento.
        await this.prisma.$transaction(async (tx) => {
          const creado = await tx.cliente.create({
            data: { razonSocial: dto.razonSocial, cuit: dto.cuit, condicionesComerciales: dto.condicionesComerciales || null },
          });
          await registrarAuditoria(tx, {
            usuarioId: actor.id,
            entidad: ENTIDAD_CLIENTE,
            entidadId: creado.id,
            accion: "cliente_creado",
            datosNuevos: marcarOrigenImportacionCsv(snapshotCliente(creado)),
          });
        });
        creados++;
        detalle.push({ fila: numeroFila, ok: true, mensaje: "Creado correctamente." });
      } catch (error) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: mensajeErrorImportacion(error) });
      }
    }
    return { total: filas.length, creados, rechazados: filas.length - creados, detalle };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const cliente = await this.prisma.cliente.findUnique({ where: { id }, include: { contactos: true } });
    return encontrarOFallar(cliente, "Cliente no encontrado.");
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateClienteDto, @CurrentUser() actor: any) {
    const { contactos, ...data } = body;
    return this.prisma.$transaction(async (tx) => {
      const creado = await tx.cliente.create({
        data: { ...data, contactos: contactos ? { create: contactos } : undefined },
        include: { contactos: true },
      });
      await registrarAuditoria(tx, {
        usuarioId: actor.id,
        entidad: ENTIDAD_CLIENTE,
        entidadId: creado.id,
        accion: "cliente_creado",
        datosNuevos: snapshotCliente(creado),
      });
      return creado;
    });
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateClienteDto, @CurrentUser() actor: any) {
    const { contactos, ...data } = body;
    return this.prisma.$transaction(async (tx) => {
      const actual = encontrarOFallar(await tx.cliente.findUnique({ where: { id } }), "Cliente no encontrado.");
      const actualizado = await tx.cliente.update({ where: { id }, data });

      // CAT-4, sección 3: un PATCH que cambia "activo" Y otros campos genera dos eventos
      // separados (estado + edición), ambos atómicos con el UPDATE en esta misma transacción.
      // Ningún evento se genera si nada cambió realmente (PATCH idempotente).
      const antes = snapshotCliente(actual);
      const despues = snapshotCliente(actualizado);
      const cambios = calcularCamposCambiados(antes, despues);
      const cambioActivo = cambios.includes("activo");
      const otrosCambios = cambios.filter((c) => c !== "activo");

      if (cambioActivo) {
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          entidad: ENTIDAD_CLIENTE,
          entidadId: id,
          accion: despues.activo ? "cliente_reactivado" : "cliente_desactivado",
          datosAnteriores: { razonSocial: antes.razonSocial, activo: antes.activo },
          datosNuevos: { razonSocial: despues.razonSocial, activo: despues.activo },
        });
      }
      if (otrosCambios.length > 0) {
        const claves = Array.from(new Set(["razonSocial", ...otrosCambios]));
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          entidad: ENTIDAD_CLIENTE,
          entidadId: id,
          accion: "cliente_editado",
          datosAnteriores: subconjunto(antes, claves),
          datosNuevos: subconjunto(despues, claves),
        });
      }
      return actualizado;
    });
  }

  @Roles("OPERACIONES", "FACTURACION", "ADMINISTRADOR")
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() actor: any) {
    return this.prisma.$transaction(async (tx) => {
      const actual = encontrarOFallar(await tx.cliente.findUnique({ where: { id } }), "Cliente no encontrado.");
      const actualizado = await tx.cliente.update({ where: { id }, data: { activo: false } });
      if (actual.activo !== actualizado.activo) {
        await registrarAuditoria(tx, {
          usuarioId: actor.id,
          entidad: ENTIDAD_CLIENTE,
          entidadId: id,
          accion: "cliente_desactivado",
          datosAnteriores: { razonSocial: actual.razonSocial, activo: actual.activo },
          datosNuevos: { razonSocial: actualizado.razonSocial, activo: actualizado.activo },
        });
      }
      return actualizado;
    });
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
    // Bloque 11, H-08: una factura ANULADO no puede tener cobranzas vigentes asociadas
    // (facturas.controller.ts, anular() lo rechaza explícitamente) — excluirla acá nunca
    // hace desaparecer un cobro real ya registrado, solo el importe de una factura cancelada.
    const facturas = await this.prisma.factura.findMany({
      where: { clienteId: id, estado: { not: "ANULADO" } },
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
