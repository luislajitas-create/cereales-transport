import { BadRequestException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FacturasController } from "./facturas.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// FAC-4: mismo criterio de mock que facturas.controller.cobranzas-anular.spec.ts (FAC-3) — sin
// DB real, se mockea únicamente lo que registrarCobranza() efectivamente usa. Corre dentro de
// $transaction(async (tx) => {...}); acá se simula ese callback con un `tx` propio, incluyendo
// $queryRaw (el FOR UPDATE de bloqueo de fila) y cobranza.create (a diferencia de anularCobranza,
// que usa cobranza.update).
//
// El aislamiento por organización (Bloque 8.1.d) es transparente para el controller:
// tx.factura.findUnique ya devuelve null cuando la fila es de otra organización — por eso
// "factura de otra organización" se simula igual que "factura inexistente".
function crearTx(facturaFindUniqueResultados: any[], cobranzaCreada: any = { id: "cob-nueva-1" }) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    factura: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
    cobranza: {
      create: jest.fn().mockResolvedValue(cobranzaCreada),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue(undefined),
    },
  };
  facturaFindUniqueResultados.forEach((resultado) => {
    (tx.factura.findUnique as jest.Mock).mockResolvedValueOnce(resultado);
  });
  return tx;
}

function crearPrismaMock(tx: ReturnType<typeof crearTx>) {
  return {
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
}

function cobranzaVigente(overrides: Partial<any> = {}) {
  return {
    id: "cob-previa",
    facturaId: "fact-1",
    fecha: new Date("2026-07-01"),
    importe: 300,
    medioPago: "TRANSFERENCIA",
    observacion: null,
    anulada: false,
    anuladaMotivo: null,
    anuladaFecha: null,
    ...overrides,
  };
}

const USER = { id: "user-1", rol: "FACTURACION" };
const BODY_BASE = { fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA", observacion: "Pago según acuerdo" };

describe("FacturasController.registrarCobranza (FAC-4 — auditoría)", () => {
  it("registro exitoso: crea exactamente una cobranza y un AuditLog", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", BODY_BASE as any, USER);

    expect(tx.cobranza.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("la auditoría usa el ID real devuelto por cobranza.create, no un valor supuesto", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}], { id: "cob-real-devuelto-por-create" });
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", BODY_BASE as any, USER);

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entidadId: "cob-real-devuelto-por-create" }) }),
    );
  });

  it("la auditoría contiene usuario, entidad, factura, cliente, importe, fecha y medio de pago", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}], { id: "cob-nueva-1" });
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza(
      "fact-1",
      { fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA", observacion: "Pago según acuerdo" } as any,
      USER,
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        usuarioId: "user-1",
        entidad: "Cobranza",
        entidadId: "cob-nueva-1",
        accion: "crear",
        datosAnteriores: { facturaEstado: "FACTURADO", totalCobradoVigente: 0, saldo: 1000 },
        datosNuevos: {
          facturaId: "fact-1",
          clienteId: "cli-1",
          importe: 400,
          fecha: new Date("2026-08-01"),
          medioPago: "TRANSFERENCIA",
          observacion: "Pago según acuerdo",
          facturaEstado: "COBRADO_PARCIAL",
          totalCobradoVigente: 400,
          saldo: 600,
        },
      },
    });
  });

  it("no incluye la clave 'observacion' en la auditoría cuando no se envía observación", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA" } as any, USER);

    const llamada = (tx.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(llamada.data.datosNuevos).not.toHaveProperty("observacion");
  });

  it("la auditoría guarda exactamente el medio confirmado por el usuario, incluyendo una descripción personalizada ('Otro' del frontend)", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}], { id: "cob-nueva-1" });
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza(
      "fact-1",
      { fecha: "2026-08-01", importe: 400, medioPago: "Cheque diferido a 60 días" } as any,
      USER,
    );

    expect(tx.cobranza.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ medioPago: "Cheque diferido a 60 días" }) }),
    );
    const llamada = (tx.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(llamada.data.datosNuevos.medioPago).toBe("Cheque diferido a 60 días");
    expect(llamada.data.datosNuevos.medioPago).not.toBe("OTRO");
  });

  it("rechaza (guard defensivo del controller) un medioPago ausente o vacío, sin llegar a crear cobranza ni auditoría", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(
      controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 400, medioPago: "   " } as any, USER),
    ).rejects.toThrow(BadRequestException);
    expect(tx.cobranza.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("registra estados, totales cobrados y saldos anterior/posterior correctos (pago parcial sobre saldo ya parcial)", async () => {
    const factura = {
      id: "fact-1",
      clienteId: "cli-1",
      importe: 1000,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranzaVigente({ importe: 300 })],
    };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 200, medioPago: "EFECTIVO" } as any, USER);

    const llamada = (tx.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(llamada.data.datosAnteriores).toEqual({ facturaEstado: "COBRADO_PARCIAL", totalCobradoVigente: 300, saldo: 700 });
    expect(llamada.data.datosNuevos).toEqual(
      expect.objectContaining({ facturaEstado: "COBRADO_PARCIAL", totalCobradoVigente: 500, saldo: 500 }),
    );
    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "COBRADO_PARCIAL" } });
  });

  it("pago parcial: factura sin cobranzas previas pasa a COBRADO_PARCIAL", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA" } as any, USER);

    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "COBRADO_PARCIAL" } });
  });

  it("pago que completa totalmente la factura pasa a COBRADO_TOTAL", async () => {
    const factura = {
      id: "fact-1",
      clienteId: "cli-1",
      importe: 1000,
      estado: "COBRADO_PARCIAL",
      cobranzas: [cobranzaVigente({ importe: 600 })],
    };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 400, medioPago: "TRANSFERENCIA" } as any, USER);

    expect(tx.factura.update).toHaveBeenCalledWith({ where: { id: "fact-1" }, data: { estado: "COBRADO_TOTAL" } });
  });

  it("rechaza cuando la factura no existe", async () => {
    const tx = crearTx([null]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-x", BODY_BASE as any, USER)).rejects.toThrow(NotFoundException);
    expect(tx.cobranza.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rechaza factura de otra organización (findUnique ya filtrado por el aislamiento de 8.1.d devuelve null)", async () => {
    const tx = crearTx([null]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-otra-org", BODY_BASE as any, USER)).rejects.toThrow(NotFoundException);
    expect(tx.cobranza.create).not.toHaveBeenCalled();
  });

  it("rechaza registrar una cobranza sobre una factura anulada", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "ANULADO", cobranzas: [] };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-1", BODY_BASE as any, USER)).rejects.toThrow(BadRequestException);
    expect(tx.cobranza.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("rechaza un importe que supera el saldo pendiente (regla existente, sin pagos excedentes)", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(
      controller.registrarCobranza("fact-1", { fecha: "2026-08-01", importe: 1500, medioPago: "TRANSFERENCIA" } as any, USER),
    ).rejects.toThrow(BadRequestException);
    expect(tx.cobranza.create).not.toHaveBeenCalled();
  });

  it("no crea auditoría duplicada: auditLog.create se invoca exactamente una vez por operación", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await controller.registrarCobranza("fact-1", BODY_BASE as any, USER);

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("si auditLog.create falla, la operación transaccional completa se rechaza (no se considera exitosa)", async () => {
    // Precisión importante: este test no tiene una base de datos real detrás, así que NO
    // demuestra un rollback físico en PostgreSQL. Lo que sí prueba, a nivel de código: el fallo
    // de auditLog.create se propaga como excepción del callback de $transaction, y factura.update
    // (que corre DESPUÉS en el código) nunca llega a ejecutarse dentro de ese mismo callback. La
    // atomicidad real — que cobranza.create también se revierta en la base — es una garantía de
    // Prisma/PostgreSQL sobre transacciones interactivas, no algo que este mock reproduzca ni
    // que debamos afirmar que reproduce.
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado de auditoría"));
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-1", BODY_BASE as any, USER)).rejects.toThrow(
      "fallo simulado de auditoría",
    );
    expect(tx.cobranza.create).toHaveBeenCalledTimes(1);
    expect(tx.factura.update).not.toHaveBeenCalled();
  });

  it("nunca genera una auditoría de Cobranza con usuarioId null: rechaza si no hay usuario identificable (user undefined)", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-1", BODY_BASE as any, undefined as any)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.cobranza.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("nunca genera una auditoría de Cobranza con usuarioId null: rechaza si el usuario no tiene id (objeto sin id)", async () => {
    const factura = { id: "fact-1", clienteId: "cli-1", importe: 1000, estado: "FACTURADO", cobranzas: [] };
    const tx = crearTx([factura, {}]);
    const prisma = crearPrismaMock(tx);
    const controller = new FacturasController(prisma);

    await expect(controller.registrarCobranza("fact-1", BODY_BASE as any, { rol: "FACTURACION" } as any)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(tx.cobranza.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
