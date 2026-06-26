import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";

@UseGuards(JwtAuthGuard)
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

  @Post()
  create(@Body() body: any) {
    const { contactos, ...data } = body;
    return this.prisma.cliente.create({
      data: { ...data, contactos: contactos ? { create: contactos } : undefined },
      include: { contactos: true },
    });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: any) {
    const { contactos, ...data } = body;
    return this.prisma.cliente.update({ where: { id }, data });
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.cliente.update({ where: { id }, data: { activo: false } });
  }

  @Get(":id/cuenta-corriente")
  async cuentaCorriente(@Param("id") id: string) {
    const facturas = await this.prisma.factura.findMany({
      where: { clienteId: id },
      include: { cobranzas: true },
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
