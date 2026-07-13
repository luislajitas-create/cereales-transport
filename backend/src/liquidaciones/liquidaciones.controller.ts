import {
  Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards, BadRequestException, NotFoundException,
} from "@nestjs/common";
import { Response } from "express";
import * as ExcelJS from "exceljs";
import PDFDocument = require("pdfkit");
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { CreateLiquidacionDto } from "./dto/create-liquidacion.dto";
import { PagarLiquidacionDto } from "./dto/pagar-liquidacion.dto";

const includeLiquidacion = {
  transportista: true,
  chofer: true,
  creadoPor: { select: { id: true, nombre: true } },
  viajes: {
    include: {
      viaje: {
        include: {
          cereal: true, cliente: true, productor: true, origen: true, destino: true, camion: true, acoplado: true,
          facturasViaje: { include: { factura: { select: { numero: true, estado: true } } } },
        },
      },
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

const CATEGORIAS_ADELANTO = ["Seguros", "Transferencia Bancaria", "Efectivo", "Combustible", "Otros"];

// Bloque 5.3.2: fuente única de la estructura "planilla" — pantalla, PDF y Excel
// consumen exactamente esta misma forma de datos, sin recalcular nada por su cuenta.
// No cambia ningún cálculo existente (totalBruto/totalAnticipos/totalDescuentos/netoPagar
// siguen viniendo de recomputeTotales, sin tocar); esto solo reorganiza esos mismos
// movimientos por viaje y por categoría para presentarlos como planilla.
function construirPlanilla(liquidacion: any) {
  const filas = liquidacion.viajes.map((lv: any) => {
    const v = lv.viaje;
    const adelantosPorCategoria: Record<string, number> = {};
    for (const cat of CATEGORIAS_ADELANTO) adelantosPorCategoria[cat] = 0;
    for (const m of liquidacion.movimientos) {
      if (m.viajeId !== v.id) continue;
      adelantosPorCategoria[categorizarAnticipo(m.tipoGasto?.nombre)] += m.importe;
    }
    const totalAdelantos = CATEGORIAS_ADELANTO.reduce((acc, cat) => acc + adelantosPorCategoria[cat], 0);
    // Solo facturas vigentes (no ANULADO) — un viaje refacturado tras anular la factura
    // original (ver commit cb42b66) puede tener más de un FacturaViaje histórico; acá
    // se ignora el/los anulados para no mostrar como "vigente" un número que ya no lo es.
    const facturasVigentes = (v.facturasViaje || []).filter((fv: any) => fv.factura?.estado !== "ANULADO");
    const facturaNumero = facturasVigentes.length > 0 ? facturasVigentes.map((fv: any) => fv.factura.numero).join(", ") : null;
    return {
      liquidacionViajeId: lv.id,
      viajeId: v.id,
      numeroViaje: v.numeroViaje,
      fecha: v.fecha,
      cartaPorte: v.cartaPorte,
      ctg: v.ctg,
      cereal: v.cereal?.nombre || "-",
      cliente: v.cliente?.razonSocial || "-",
      productor: v.productor?.nombre || null,
      facturaNumero,
      origen: v.origen?.nombre || "-",
      destino: v.destino?.nombre || "-",
      toneladas: v.toneladas,
      tarifaTonelada: v.tarifaTonelada,
      subtotal: lv.subtotal,
      comisionPct: lv.comisionPct,
      comisionMonto: lv.comisionMonto,
      totalViaje: lv.totalViaje,
      adelantosPorCategoria,
      totalAdelantos,
      saldo: lv.totalViaje - totalAdelantos,
    };
  });

  // Movimientos sin viajeId, o cuyo viajeId no corresponde a ningún viaje de ESTA
  // liquidación (p. ej. un gasto cargado contra un viaje de otro período): no tienen
  // fila propia, van aparte para no perderse ni duplicarse.
  const viajeIdsEnFilas = new Set(filas.map((f: any) => f.viajeId));
  const adelantosGenerales = liquidacion.movimientos
    .filter((m: any) => !m.viajeId || !viajeIdsEnFilas.has(m.viajeId))
    .map((m: any) => ({
      movimientoId: m.id,
      fecha: m.fecha,
      tipoGasto: m.tipoGasto?.nombre || "-",
      categoria: categorizarAnticipo(m.tipoGasto?.nombre),
      importe: m.importe,
      observacion: m.observacion || null,
      numeroViajeReferenciado: m.viaje?.numeroViaje || null,
    }));

  const totalesPorCategoria: Record<string, number> = {};
  for (const cat of CATEGORIAS_ADELANTO) totalesPorCategoria[cat] = 0;
  for (const f of filas) for (const cat of CATEGORIAS_ADELANTO) totalesPorCategoria[cat] += f.adelantosPorCategoria[cat];
  for (const a of adelantosGenerales) totalesPorCategoria[a.categoria] += a.importe;

  const totalSubtotal = filas.reduce((acc: number, f: any) => acc + f.subtotal, 0);
  const totalComisionMonto = filas.reduce((acc: number, f: any) => acc + f.comisionMonto, 0);
  const totalTotalViaje = filas.reduce((acc: number, f: any) => acc + f.totalViaje, 0);
  // Suma de display para la banda de resumen (cantidad de viajes ya es filas.length) —
  // no participa de ningún total financiero, no es un cálculo de negocio.
  const totalToneladas = filas.reduce((acc: number, f: any) => acc + f.toneladas, 0);
  const totalAdelantosGeneral = CATEGORIAS_ADELANTO.reduce((acc, cat) => acc + totalesPorCategoria[cat], 0);

  return {
    categorias: CATEGORIAS_ADELANTO,
    filas,
    adelantosGenerales,
    totales: {
      subtotal: totalSubtotal,
      comisionMonto: totalComisionMonto,
      totalViaje: totalTotalViaje,
      toneladas: totalToneladas,
      adelantosPorCategoria: totalesPorCategoria,
      totalAdelantos: totalAdelantosGeneral,
      // Coincide algebraicamente con netoPagar (totalBruto - todos los movimientos),
      // sirve como verificación cruzada: si no coincide, es un bug de datos, no un
      // ajuste que el usuario deba reconciliar a mano.
      saldoFinal: totalTotalViaje - totalAdelantosGeneral,
    },
  };
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
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

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
    return { ...liquidacion, planilla: construirPlanilla(liquidacion) };
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

    const planilla = construirPlanilla(liquidacion);

    sheet.addRow(["Viajes incluidos"]).font = { bold: true };
    const headerViajes = sheet.addRow([
      "Fecha", "N° Viaje", "CP", "CTG", "Cereal", "Cliente", "Productor", "Origen", "Destino",
      "Toneladas", "Tarifa", "Subtotal", "Comisión %", "Comisión $", "Total",
      "Seguros", "Transf. Bancaria", "Efectivo", "Combustible", "Otros", "Saldo",
    ]);
    headerViajes.font = { bold: true };
    for (const f of planilla.filas) {
      sheet.addRow([
        new Date(f.fecha).toLocaleDateString("es-AR"),
        f.numeroViaje,
        f.cartaPorte || "-",
        f.ctg || "-",
        f.cereal,
        f.cliente,
        f.productor || "-",
        f.origen,
        f.destino,
        f.toneladas,
        f.tarifaTonelada,
        f.subtotal,
        f.comisionPct,
        f.comisionMonto,
        f.totalViaje,
        f.adelantosPorCategoria["Seguros"],
        f.adelantosPorCategoria["Transferencia Bancaria"],
        f.adelantosPorCategoria["Efectivo"],
        f.adelantosPorCategoria["Combustible"],
        f.adelantosPorCategoria["Otros"],
        f.saldo,
      ]);
    }
    const filaTotalesViajes = sheet.addRow([
      "", "", "", "", "", "", "", "", "", "", "Totales",
      planilla.totales.subtotal, "", planilla.totales.comisionMonto, planilla.totales.totalViaje,
      planilla.totales.adelantosPorCategoria["Seguros"],
      planilla.totales.adelantosPorCategoria["Transferencia Bancaria"],
      planilla.totales.adelantosPorCategoria["Efectivo"],
      planilla.totales.adelantosPorCategoria["Combustible"],
      planilla.totales.adelantosPorCategoria["Otros"],
      planilla.totales.saldoFinal,
    ]);
    filaTotalesViajes.font = { bold: true };

    sheet.addRow([]);
    if (planilla.adelantosGenerales.length > 0) {
      sheet.addRow(["Adelantos / gastos generales del período (sin viaje asociado)"]).font = { bold: true };
      const headerGenerales = sheet.addRow(["Fecha", "Tipo", "Categoría", "Importe", "Observación", "Viaje referenciado"]);
      headerGenerales.font = { bold: true };
      for (const a of planilla.adelantosGenerales) {
        sheet.addRow([
          new Date(a.fecha).toLocaleDateString("es-AR"),
          a.tipoGasto,
          a.categoria,
          a.importe,
          a.observacion || "-",
          a.numeroViajeReferenciado ? `N° ${a.numeroViajeReferenciado}` : "-",
        ]);
      }
      sheet.addRow([]);
    }

    sheet.addRow(["Total bruto", liquidacion.totalBruto]);
    sheet.addRow(["Total anticipos", liquidacion.totalAnticipos]);
    sheet.addRow(["Total descuentos", liquidacion.totalDescuentos]);
    sheet.addRow(["Neto a pagar", liquidacion.netoPagar]).font = { bold: true };

    sheet.columns.forEach((col) => { col.width = 14; });

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

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(16).text(`Liquidación N° ${liquidacion.numero}`, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10);
    if (liquidacion.tipo === "CHOFER") {
      const datos = datosChoferHeader(liquidacion);
      doc.text(`Chofer: ${datos.nombre}  ·  CUIL: ${datos.cuil}  ·  Chasis: ${datos.chasis}  ·  Acoplado: ${datos.acoplado}`);
    } else {
      doc.text(`Tipo: ${liquidacion.tipo}  ·  Transportista: ${nombreContraparte(liquidacion)}`);
    }
    doc.text(
      `Período: ${new Date(liquidacion.periodoDesde).toLocaleDateString("es-AR")} - ${new Date(liquidacion.periodoHasta).toLocaleDateString("es-AR")}  ·  Estado: ${liquidacion.estado}`,
    );
    doc.moveDown(0.6);

    const planilla = construirPlanilla(liquidacion);

    // Mismas 10 columnas "principales" que la pantalla (Fecha/CP/Cliente/Origen/
    // Destino/Tn/Tarifa/Bruto/Descuentos/Neto), en formato vertical legible/imprimible.
    // Descuentos = comisión + adelantos combinados, para que Bruto - Descuentos = Neto
    // se lea de un vistazo sin tener que entender el desglose (ese va en la línea
    // secundaria de abajo). Los datos secundarios (N°/CTG/Cereal/Productor/desglose
    // por categoría) van en una línea gris compacta debajo de cada fila principal.
    const columnas = [
      { titulo: "Fecha", ancho: 42 },
      { titulo: "C. Porte", ancho: 55 },
      { titulo: "Cliente", ancho: 66 },
      { titulo: "Origen", ancho: 55 },
      { titulo: "Destino", ancho: 55 },
      { titulo: "Tn", ancho: 26 },
      { titulo: "Tarifa", ancho: 42 },
      { titulo: "Bruto", ancho: 48 },
      { titulo: "Descuentos", ancho: 56 },
      { titulo: "Neto", ancho: 50 },
    ];
    function truncar(texto: string, ancho: number, tamano: number) {
      if (doc.widthOfString(texto, { size: tamano }) <= ancho) return texto;
      let resultado = texto;
      while (resultado.length > 1 && doc.widthOfString(`${resultado}…`, { size: tamano }) > ancho) {
        resultado = resultado.slice(0, -1);
      }
      return `${resultado}…`;
    }

    const xInicio = doc.page.margins.left;
    const anchoTotal = columnas.reduce((acc, c) => acc + c.ancho, 0);
    let y = doc.y;

    function saltoDePaginaSiHaceFalta(margenInferior: number) {
      if (y > doc.page.height - doc.page.margins.bottom - margenInferior) {
        doc.addPage();
        y = doc.page.margins.top;
      }
    }

    function dibujarFilaPrincipal(valores: string[], opciones: { bold?: boolean } = {}) {
      saltoDePaginaSiHaceFalta(20);
      const tamano = 8.5;
      doc.fillColor("black").font(opciones.bold ? "Helvetica-Bold" : "Helvetica").fontSize(tamano);
      let x = xInicio;
      // Cada celda se trunca a su ancho de columna (títulos incluidos): en esta grilla
      // manual con altura de fila fija, un texto que pdfkit decida envolver a dos
      // líneas se superpone con la fila siguiente en vez de agrandar la fila.
      valores.forEach((valor, i) => {
        doc.text(truncar(valor, columnas[i].ancho, tamano), x, y, { width: columnas[i].ancho, align: i < 5 ? "left" : "right" });
        x += columnas[i].ancho;
      });
      y += 13;
    }

    function lineaSecundaria(f: any) {
      const partes = [`N° ${f.numeroViaje}`, `CTG: ${f.ctg || "-"}`, `Cereal: ${f.cereal}`, `Productor: ${f.productor || "-"}`];
      if (f.totalAdelantos > 0) {
        const desglose = CATEGORIAS_ADELANTO.filter((cat) => f.adelantosPorCategoria[cat] > 0)
          .map((cat) => `${cat}: ${fmtMoney(f.adelantosPorCategoria[cat])}`)
          .join(" · ");
        partes.push(`Comisión: ${f.comisionPct}% (${fmtMoney(f.comisionMonto)})`);
        partes.push(`Desc.: ${desglose}`);
      } else {
        partes.push(`Comisión: ${f.comisionPct}% (${fmtMoney(f.comisionMonto)})`);
      }
      saltoDePaginaSiHaceFalta(15);
      doc.fillColor("#666666").font("Helvetica").fontSize(7).text(truncar(partes.join("   ·   "), anchoTotal, 7), xInicio, y);
      doc.fillColor("black");
      y += 12;
    }

    dibujarFilaPrincipal(columnas.map((c) => c.titulo), { bold: true });
    doc.moveTo(xInicio, y - 3).lineTo(xInicio + anchoTotal, y - 3).stroke();

    for (const f of planilla.filas) {
      const descuentosFila = f.comisionMonto + f.totalAdelantos;
      dibujarFilaPrincipal([
        new Date(f.fecha).toLocaleDateString("es-AR"),
        f.cartaPorte || "-",
        f.cliente,
        f.origen,
        f.destino,
        String(f.toneladas),
        fmtMoney(f.tarifaTonelada),
        fmtMoney(f.subtotal),
        fmtMoney(descuentosFila),
        fmtMoney(f.saldo),
      ]);
      lineaSecundaria(f);
      y += 3;
    }

    const totalDescuentosColumna = planilla.totales.comisionMonto + planilla.totales.totalAdelantos;
    dibujarFilaPrincipal(
      ["", "", "", "", "Totales", "", "", fmtMoney(planilla.totales.subtotal), fmtMoney(totalDescuentosColumna), fmtMoney(planilla.totales.saldoFinal)],
      { bold: true },
    );

    y += 12;

    if (planilla.adelantosGenerales.length > 0) {
      saltoDePaginaSiHaceFalta(60);
      doc.font("Helvetica-Bold").fontSize(10).text("Adelantos / gastos generales del período (sin viaje asociado)", xInicio, y);
      y += 14;
      doc.font("Helvetica").fontSize(8);
      for (const a of planilla.adelantosGenerales) {
        saltoDePaginaSiHaceFalta(20);
        doc.text(
          `${new Date(a.fecha).toLocaleDateString("es-AR")} · ${a.tipoGasto} (${a.categoria}) · ${fmtMoney(a.importe)}${a.numeroViajeReferenciado ? ` · ref. viaje N° ${a.numeroViajeReferenciado}` : ""}`,
          xInicio,
          y,
        );
        y += 11;
      }
      y += 8;
    }

    saltoDePaginaSiHaceFalta(60);
    doc.font("Helvetica").fontSize(10);
    doc.text(`Total bruto: ${fmtMoney(liquidacion.totalBruto)}`, xInicio, y);
    y += 13;
    doc.text(`Total anticipos: ${fmtMoney(liquidacion.totalAnticipos)}`, xInicio, y);
    y += 13;
    doc.text(`Total descuentos: ${fmtMoney(liquidacion.totalDescuentos)}`, xInicio, y);
    y += 13;
    doc.font("Helvetica-Bold").fontSize(12).text(`Neto a pagar: ${fmtMoney(liquidacion.netoPagar)}`, xInicio, y);

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

    let chofer: { id: string; comisionPct: number; activo: boolean } | null = null;
    if (tipo === "CHOFER") {
      chofer = await this.prisma.chofer.findUnique({ where: { id: choferId } });
      if (!chofer) throw new NotFoundException("Chofer no encontrado.");
      if (!chofer.activo) {
        throw new BadRequestException("El chofer seleccionado está dado de baja. Reactívelo antes de crear la liquidación.");
      }
    }

    if (tipo === "TRANSPORTISTA") {
      const transportista = await this.prisma.transportista.findUnique({ where: { id: transportistaId } });
      if (!transportista) throw new NotFoundException("Transportista no encontrado.");
      if (!transportista.activo) {
        throw new BadRequestException("El transportista seleccionado está dado de baja. Reactívelo antes de crear la liquidación.");
      }
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
