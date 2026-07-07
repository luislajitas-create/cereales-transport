import {
  Body, Controller, Get, Param, Post, Query, Res, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLiquidacionDto } from "./dto/create-liquidacion.dto";
import { PagarLiquidacionDto } from "./dto/pagar-liquidacion.dto";

const includeLiquidacion = {
  transportista: true,
  chofer: true,
  creadoPor: { select: { id: true, nombre: true } },
  viajes: {
    include: {
      viaje: { include: { cereal: true, cliente: true, origen: true, destino: true, camion: true, acoplado: true } },
    },
  },
  movimientos: { include: { tipoGasto: true, viaje: { select: { id: true, numeroViaje: true } } } },
};

function esAdelanto(nombreTipoGasto: string) {
  const n = (nombreTipoGasto || "").toLowerCase();
  return n.includes("anticipo") || n.includes("adelanto");
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

function nombreContraparte(liquidacion: any) {
  return liquidacion.transportista?.razonSocial || liquidacion.chofer?.nombre || "-";
}

function categorizarAnticipo(nombreTipoGasto: string) {
  const n = (nombreTipoGasto || "").toLowerCase();
  if (n.includes("segur")) return "Seguros";
  if (n.includes("transf") || n.includes("banc")) return "Transferencia Bancaria";
  if (n.includes("efectivo")) return "Efectivo";
  if (n.includes("combustible") || n.includes("gasoil") || n.includes("nafta") || n.includes("ypf")) return "Combustible";
  return "Otros";
}

function agruparAnticipos(movimientos: any[]) {
  const categorias = ["Seguros", "Transferencia Bancaria", "Efectivo", "Combustible", "Otros"];
  const grupos: Record<string, { items: any[]; total: number }> = {};
  for (const cat of categorias) grupos[cat] = { items: [], total: 0 };
  for (const m of movimientos) {
    const cat = categorizarAnticipo(m.tipoGasto?.nombre);
    grupos[cat].items.push(m);
    grupos[cat].total += m.importe;
  }
  return categorias.map((cat) => ({ categoria: cat, ...grupos[cat] })).filter((g) => g.items.length > 0);
}

function datosChoferHeader(liquidacion: any) {
  const chofer = liquidacion.chofer;
  const primerViaje = liquidacion.viajes[0]?.viaje;
  return {
    nombre: chofer?.nombre || "-",
    cuil: chofer?.cuil || "-",
    chasis: primerViaje?.camion?.patente || "-",
    acoplado: primerViaje?.acoplado?.patente || "-",
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("liquidaciones")
export class LiquidacionesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query("transportistaId") transportistaId?: string,
    @Query("choferId") choferId?: string,
    @Query("estado") estado?: string,
    @Query("tipo") tipo?: string,
  ) {
    const where: any = {};
    if (transportistaId) where.transportistaId = transportistaId;
    if (choferId) where.choferId = choferId;
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;
    return this.prisma.liquidacion.findMany({
      where,
      include: includeLiquidacion,
      orderBy: { createdAt: "desc" },
    });
  }

  @Get("candidatos")
  async candidatos(
    @Query("tipo") tipo: "TRANSPORTISTA" | "CHOFER",
    @Query("transportistaId") transportistaId?: string,
    @Query("choferId") choferId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    if (!tipo || !["TRANSPORTISTA", "CHOFER"].includes(tipo)) {
      throw new BadRequestException("tipo debe ser TRANSPORTISTA o CHOFER");
    }
    if (tipo === "TRANSPORTISTA" && !transportistaId) {
      throw new BadRequestException("transportistaId es obligatorio para tipo TRANSPORTISTA");
    }
    if (tipo === "CHOFER" && !choferId) {
      throw new BadRequestException("choferId es obligatorio para tipo CHOFER");
    }

    const whereViaje: any = {
      estado: "DESCARGADO",
      estadoLiquidacion: "PENDIENTE",
    };
    if (tipo === "TRANSPORTISTA") whereViaje.transportistaId = transportistaId;
    if (tipo === "CHOFER") whereViaje.choferId = choferId;
    if (desde || hasta) {
      whereViaje.fecha = {};
      if (desde) whereViaje.fecha.gte = new Date(desde);
      if (hasta) whereViaje.fecha.lte = new Date(hasta);
    }

    const whereAnticipo: any = { anulado: false, liquidado: false };
    if (tipo === "TRANSPORTISTA") whereAnticipo.transportistaId = transportistaId;
    if (tipo === "CHOFER") whereAnticipo.choferId = choferId;
    if (desde || hasta) {
      whereAnticipo.fecha = {};
      if (desde) whereAnticipo.fecha.gte = new Date(desde);
      if (hasta) whereAnticipo.fecha.lte = new Date(hasta);
    }

    const [viajes, anticipos] = await Promise.all([
      this.prisma.viaje.findMany({
        where: whereViaje,
        include: { cereal: true, cliente: true, origen: true, destino: true, chofer: true },
        orderBy: { fecha: "asc" },
      }),
      this.prisma.anticipoGasto.findMany({
        where: whereAnticipo,
        include: { tipoGasto: true, viaje: { select: { id: true, numeroViaje: true } } },
        orderBy: { fecha: "asc" },
      }),
    ]);

    return { viajes, anticipos };
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: includeLiquidacion,
    });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");
    return liquidacion;
  }

  @Get(":id/excel")
  async exportarExcel(@Param("id") id: string, @Res() res: Response) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: includeLiquidacion,
    });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Liquidación");

    sheet.addRow([`Liquidación N° ${liquidacion.numero}`]);
    if (liquidacion.tipo === "CHOFER") {
      const datos = datosChoferHeader(liquidacion);
      sheet.addRow([`Chofer: ${datos.nombre}`]);
      sheet.addRow([`CUIL: ${datos.cuil}`]);
      sheet.addRow([`Chasis: ${datos.chasis}`, `Acoplado: ${datos.acoplado}`]);
    } else {
      sheet.addRow([`Tipo: ${liquidacion.tipo}`]);
      sheet.addRow([`Transportista: ${nombreContraparte(liquidacion)}`]);
    }
    sheet.addRow([
      `Período: ${new Date(liquidacion.periodoDesde).toLocaleDateString("es-AR")} - ${new Date(liquidacion.periodoHasta).toLocaleDateString("es-AR")}`,
    ]);
    sheet.addRow([`Estado: ${liquidacion.estado}`]);
    sheet.addRow([]);

    sheet.addRow(["Viajes incluidos"]).font = { bold: true };
    const headerViajes = sheet.addRow([
      "Fecha", "CP", "CTG", "Origen", "Destino", "Toneladas", "Tarifa", "Importe", "Comisión %", "Comisión $", "Total",
    ]);
    headerViajes.font = { bold: true };
    for (const lv of liquidacion.viajes) {
      sheet.addRow([
        new Date(lv.viaje.fecha).toLocaleDateString("es-AR"),
        lv.viaje.cartaPorte || "-",
        lv.viaje.ctg || "-",
        lv.viaje.origen?.nombre || "-",
        lv.viaje.destino?.nombre || "-",
        lv.viaje.toneladas,
        lv.viaje.tarifaTonelada,
        lv.subtotal,
        lv.comisionPct,
        lv.comisionMonto,
        lv.totalViaje,
      ]);
    }

    sheet.addRow([]);
    if (liquidacion.movimientos.length > 0) {
      sheet.addRow(["Anticipos / gastos descontados"]).font = { bold: true };
      const grupos = agruparAnticipos(liquidacion.movimientos);
      for (const grupo of grupos) {
        sheet.addRow([grupo.categoria]).font = { bold: true };
        const headerMov = sheet.addRow(["Fecha", "Tipo", "Importe"]);
        headerMov.font = { bold: true };
        for (const m of grupo.items) {
          sheet.addRow([new Date(m.fecha).toLocaleDateString("es-AR"), m.tipoGasto?.nombre || "-", m.importe]);
        }
        sheet.addRow(["", "Subtotal " + grupo.categoria, grupo.total]).font = { bold: true };
        sheet.addRow([]);
      }
    }

    sheet.addRow(["Total bruto", liquidacion.totalBruto]);
    sheet.addRow(["Total anticipos", liquidacion.totalAnticipos]);
    sheet.addRow(["Total descuentos", liquidacion.totalDescuentos]);
    sheet.addRow(["Neto a pagar", liquidacion.netoPagar]).font = { bold: true };

    sheet.columns.forEach((col) => { col.width = 22; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liquidacion-${liquidacion.numero}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  }

  @Get(":id/pdf")
  async exportarPdf(@Param("id") id: string, @Res() res: Response) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: includeLiquidacion,
    });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="liquidacion-${liquidacion.numero}.pdf"`,
    });

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(18).text(`Liquidación N° ${liquidacion.numero}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(11);
    if (liquidacion.tipo === "CHOFER") {
      const datos = datosChoferHeader(liquidacion);
      doc.text(`Chofer: ${datos.nombre}`);
      doc.text(`CUIL: ${datos.cuil}`);
      doc.text(`Chasis: ${datos.chasis}  ·  Acoplado: ${datos.acoplado}`);
    } else {
      doc.text(`Tipo: ${liquidacion.tipo}`);
      doc.text(`Transportista: ${nombreContraparte(liquidacion)}`);
    }
    doc.text(
      `Período: ${new Date(liquidacion.periodoDesde).toLocaleDateString("es-AR")} - ${new Date(liquidacion.periodoHasta).toLocaleDateString("es-AR")}`,
    );
    doc.text(`Estado: ${liquidacion.estado}`);
    doc.moveDown();

    doc.fontSize(13).text("Viajes incluidos", { underline: true });
    doc.fontSize(9);
    for (const lv of liquidacion.viajes) {
      const v = lv.viaje;
      doc.text(
        `${new Date(v.fecha).toLocaleDateString("es-AR")} · CP: ${v.cartaPorte || "-"} · CTG: ${v.ctg || "-"} · ${v.origen?.nombre || "-"} → ${v.destino?.nombre || "-"} · ${v.toneladas} tn · Tarifa: ${fmtMoney(v.tarifaTonelada)}`,
      );
      doc.text(
        `   Importe: ${fmtMoney(lv.subtotal)} · Comisión: ${fmtMoney(lv.comisionMonto)} (${lv.comisionPct}%) · Total: ${fmtMoney(lv.totalViaje)}`,
      );
      doc.moveDown(0.3);
    }
    doc.moveDown();

    if (liquidacion.movimientos.length > 0) {
      doc.fontSize(13).text("Anticipos / gastos descontados", { underline: true });
      const grupos = agruparAnticipos(liquidacion.movimientos);
      for (const grupo of grupos) {
        doc.fontSize(11).text(grupo.categoria, { underline: true });
        doc.fontSize(10);
        for (const m of grupo.items) {
          doc.text(`${new Date(m.fecha).toLocaleDateString("es-AR")} · ${m.tipoGasto?.nombre || "-"} · ${fmtMoney(m.importe)}`);
        }
        doc.fontSize(10).text(`Subtotal ${grupo.categoria}: ${fmtMoney(grupo.total)}`);
        doc.moveDown(0.5);
      }
      doc.moveDown();
    }

    doc.fontSize(11);
    doc.text(`Total bruto: ${fmtMoney(liquidacion.totalBruto)}`);
    doc.text(`Total anticipos: ${fmtMoney(liquidacion.totalAnticipos)}`);
    doc.text(`Total descuentos: ${fmtMoney(liquidacion.totalDescuentos)}`);
    doc.fontSize(13).text(`Neto a pagar: ${fmtMoney(liquidacion.netoPagar)}`, { underline: true });

    doc.end();
  }

  @Roles("LIQUIDACIONES", "ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateLiquidacionDto, @CurrentUser() user: any) {
    const { tipo, transportistaId, choferId, periodoDesde, periodoHasta, comisionPct, viajeIds, anticipoIds } = body;
    if (!tipo || !["TRANSPORTISTA", "CHOFER"].includes(tipo)) {
      throw new BadRequestException("tipo debe ser TRANSPORTISTA o CHOFER");
    }
    if (tipo === "TRANSPORTISTA" && !transportistaId) {
      throw new BadRequestException("transportistaId es obligatorio");
    }
    if (tipo === "CHOFER" && !choferId) {
      throw new BadRequestException("choferId es obligatorio");
    }
    if (!periodoDesde || !periodoHasta) {
      throw new BadRequestException("periodoDesde y periodoHasta son obligatorios");
    }
    if (!Array.isArray(viajeIds) || viajeIds.length === 0) {
      throw new BadRequestException("Debe incluir al menos un viaje");
    }

    let chofer: { id: string; comisionPct: number } | null = null;
    if (tipo === "CHOFER") {
      chofer = await this.prisma.chofer.findUnique({ where: { id: choferId } });
      if (!chofer) throw new NotFoundException("Chofer no encontrado");
    }

    const pctChoferDefault = chofer?.comisionPct ?? 0;
    const pct = comisionPct !== undefined && comisionPct !== null ? Number(comisionPct) : pctChoferDefault;

    const viajes = await this.prisma.viaje.findMany({
      where: {
        id: { in: viajeIds },
        estado: "DESCARGADO",
        estadoLiquidacion: "PENDIENTE",
        ...(tipo === "TRANSPORTISTA" ? { transportistaId } : { choferId }),
      },
    });
    if (viajes.length !== viajeIds.length) {
      throw new BadRequestException(
        "Alguno de los viajes seleccionados no existe, no está DESCARGADO, ya fue liquidado o no corresponde al transportista/chofer indicado",
      );
    }

    let anticipos: any[] = [];
    if (Array.isArray(anticipoIds) && anticipoIds.length > 0) {
      anticipos = await this.prisma.anticipoGasto.findMany({
        where: {
          id: { in: anticipoIds },
          anulado: false,
          liquidado: false,
          ...(tipo === "TRANSPORTISTA" ? { transportistaId } : { choferId }),
        },
        include: { tipoGasto: true },
      });
      if (anticipos.length !== anticipoIds.length) {
        throw new BadRequestException(
          "Alguno de los anticipos/gastos seleccionados no existe, ya fue liquidado, está anulado o no corresponde",
        );
      }
    }

    const liquidacion = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.liquidacion.create({
        data: {
          tipo,
          transportistaId: tipo === "TRANSPORTISTA" ? transportistaId : null,
          choferId: tipo === "CHOFER" ? choferId : null,
          periodoDesde: new Date(periodoDesde),
          periodoHasta: new Date(periodoHasta),
          comisionPct: pct,
          creadoPorId: user?.id || null,
        },
      });

      if (chofer && pct !== chofer.comisionPct) {
        await tx.auditLog.create({
          data: {
            usuarioId: user?.id || null,
            entidad: "Liquidacion",
            entidadId: creada.id,
            accion: "comisionPct_override",
            datosAnteriores: { comisionPctChofer: chofer.comisionPct },
            datosNuevos: { comisionPctUsado: pct },
          },
        });
      }

      for (const v of viajes) {
        const { count: viajeCount } = await tx.viaje.updateMany({
          where: { id: v.id, estadoLiquidacion: "PENDIENTE" },
          data: { estadoLiquidacion: "LIQUIDADO" },
        });
        if (viajeCount === 0) {
          throw new BadRequestException(
            "Uno de los viajes seleccionados ya fue liquidado por otra operación en curso",
          );
        }

        const subtotal = v.importeTotal;
        const comisionMonto = subtotal * (pct / 100);
        const totalViaje = subtotal - comisionMonto;
        await tx.liquidacionViaje.create({
          data: {
            liquidacionId: creada.id,
            viajeId: v.id,
            subtotal,
            comisionPct: pct,
            comisionMonto,
            totalViaje,
          },
        });
      }

      for (const a of anticipos) {
        await tx.liquidacionMovimiento.create({
          data: {
            liquidacionId: creada.id,
            viajeId: a.viajeId || null,
            tipoGastoId: a.tipoGastoId,
            anticipoGastoId: a.id,
            importe: a.importe,
            fecha: a.fecha,
            observacion: a.observaciones || null,
            comprobanteUrl: a.comprobanteUrl || null,
          },
        });
        const { count } = await tx.anticipoGasto.updateMany({
          where: { id: a.id, liquidado: false },
          data: { liquidado: true },
        });
        if (count === 0) {
          throw new BadRequestException(
            "Uno de los anticipos/gastos seleccionados ya fue liquidado por otra operación en curso",
          );
        }
      }

      return creada.id;
    });

    await this.recomputeTotales(liquidacion);
    return this.findOne(liquidacion);
  }

  @Roles("LIQUIDACIONES", "ADMINISTRADOR")
  @Post(":id/confirmar")
  async confirmar(@Param("id") id: string) {
    const liquidacion = await this.prisma.liquidacion.findUnique({ where: { id } });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");
    if (liquidacion.estado !== "BORRADOR") {
      throw new BadRequestException("Solo se puede confirmar una liquidación en estado BORRADOR");
    }
    return this.prisma.liquidacion.update({
      where: { id },
      data: { estado: "CONFIRMADA" },
      include: includeLiquidacion,
    });
  }

  @Roles("LIQUIDACIONES", "ADMINISTRADOR")
  @Post(":id/pagar")
  async pagar(@Param("id") id: string, @Body() body: PagarLiquidacionDto) {
    const liquidacion = await this.prisma.liquidacion.findUnique({ where: { id }, include: { viajes: true } });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");
    if (liquidacion.estado !== "CONFIRMADA") {
      throw new BadRequestException("Solo se puede pagar una liquidación CONFIRMADA");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.liquidacion.update({
        where: { id },
        data: { estado: "PAGADA", fechaPago: body?.fechaPago ? new Date(body.fechaPago) : new Date() },
      });
      for (const lv of liquidacion.viajes) {
        await tx.viaje.update({ where: { id: lv.viajeId }, data: { estadoLiquidacion: "PAGADO" } });
      }
    });
    return this.findOne(id);
  }

  @Roles("LIQUIDACIONES", "ADMINISTRADOR")
  @Post(":id/anular")
  async anular(@Param("id") id: string) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id },
      include: { viajes: true, movimientos: true },
    });
    if (!liquidacion) throw new NotFoundException("Liquidación no encontrada");
    if (liquidacion.estado === "PAGADA") {
      throw new BadRequestException("No se puede anular una liquidación ya pagada");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.liquidacion.update({ where: { id }, data: { estado: "ANULADA" } });
      for (const lv of liquidacion.viajes) {
        await tx.viaje.update({ where: { id: lv.viajeId }, data: { estadoLiquidacion: "PENDIENTE" } });
      }
      const anticipoGastoIds = liquidacion.movimientos.map((m) => m.anticipoGastoId).filter(Boolean) as string[];
      if (anticipoGastoIds.length > 0) {
        await tx.anticipoGasto.updateMany({
          where: {
            liquidado: true,
            id: { in: anticipoGastoIds },
          },
          data: { liquidado: false },
        });
      }

      // Ruta legacy: movimientos creados antes de existir anticipoGastoId (sin backfill,
      // ver BLOQUE3_DISENO_INTEGRIDAD_DATOS.md) solo pueden revertirse por viajeId, con el
      // mismo riesgo de contaminación cruzada que tenía el código anterior para esos casos.
      const movimientosLegacy = liquidacion.movimientos.filter((m) => !m.anticipoGastoId && m.viajeId);
      const viajeIdsLegacy = movimientosLegacy.map((m) => m.viajeId).filter(Boolean) as string[];
      if (viajeIdsLegacy.length > 0) {
        console.warn(
          `[LiquidacionesController.anular] liquidacion ${id}: revirtiendo ${viajeIdsLegacy.length} movimiento(s) legacy sin anticipoGastoId por viajeId`,
        );
        await tx.anticipoGasto.updateMany({
          where: {
            liquidado: true,
            viajeId: { in: viajeIdsLegacy },
          },
          data: { liquidado: false },
        });
      }
    });
    return this.findOne(id);
  }

  private async recomputeTotales(liquidacionId: string) {
    const liquidacion = await this.prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      include: { viajes: true, movimientos: { include: { tipoGasto: true } } },
    });
    if (!liquidacion) return;
    const totalBruto = liquidacion.viajes.reduce((acc, v) => acc + v.totalViaje, 0);
    let totalAnticipos = 0;
    let totalDescuentos = 0;
    for (const m of liquidacion.movimientos) {
      if (esAdelanto(m.tipoGasto.nombre)) totalAnticipos += m.importe;
      else totalDescuentos += m.importe;
    }
    const netoPagar = totalBruto - totalAnticipos - totalDescuentos;
    await this.prisma.liquidacion.update({
      where: { id: liquidacionId },
      data: { totalBruto, totalAnticipos, totalDescuentos, netoPagar },
    });
  }
}
