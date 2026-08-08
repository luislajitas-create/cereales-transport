import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AnticiposController } from "./anticipos.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";

// AUD-1: mismo criterio de mock que clientes.controller.auditoria.spec.ts (CAT-4) — un `tx`
// propio (findUnique/create/update/auditLog.create) y un $transaction que invoca el callback con
// ese `tx`. Sin DB real: estas pruebas no demuestran un rollback físico en PostgreSQL, prueban
// que el fallo de auditLog.create se propaga como excepción del callback de $transaction.
const ACTOR = { id: "user-1" };

const ANTICIPO_BASE = {
  id: "ant-1",
  choferId: "cho-1",
  transportistaId: "tra-1",
  tipoGastoId: "tg-1",
  viajeId: null,
  fecha: new Date("2026-08-01"),
  importe: 1000,
  observaciones: null,
  comprobanteUrl: null,
  anulado: false,
  anuladoMotivo: null,
  liquidado: false,
};

function crearTx(overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock; update: jest.Mock }> = {}) {
  return {
    anticipoGasto: {
      create: overrides.create ?? jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ANTICIPO_BASE, id: "ant-nuevo", ...data })),
      update: overrides.update ?? jest.fn(),
      findUnique: overrides.findUnique ?? jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
}
function crearPrisma(tx: ReturnType<typeof crearTx>, extra: Partial<{ chofer: jest.Mock; transportista: jest.Mock }> = {}) {
  return {
    chofer: { findUnique: extra.chofer ?? jest.fn().mockResolvedValue({ id: "cho-1", activo: true }) },
    transportista: { findUnique: extra.transportista ?? jest.fn().mockResolvedValue({ id: "tra-1", activo: true }) },
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as unknown as OrganizacionPrismaClient;
}

// Cualquier snapshot de AuditLog de este módulo, serializado, nunca debe contener una URL — ver
// "comprobanteUrl — minimización y seguridad" en AUDITORIA_FINANCIERA.md.
function sinUrlEnJson(dato: unknown) {
  const json = JSON.stringify(dato);
  expect(json).not.toMatch(/https?:\/\//i);
  expect(json).not.toMatch(/comprobanteUrl/i);
}

describe("AnticiposController — auditoría (AUD-1)", () => {
  describe("create()", () => {
    const dto = {
      choferId: "cho-1",
      transportistaId: "tra-1",
      tipoGastoId: "tg-1",
      fecha: "2026-08-01",
      importe: 1000,
    } as any;

    it("crea el anticipo y exactamente un AuditLog 'anticipo_creado', datosNuevos = snapshot por allowlist (comprobanteAdjunto, nunca la URL)", async () => {
      const tx = crearTx();
      const controller = new AnticiposController(crearPrisma(tx));

      const creado = await controller.create(dto, ACTOR);

      expect(tx.anticipoGasto.create).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.usuarioId).toBe(ACTOR.id);
      expect(evento.entidad).toBe("AnticipoGasto");
      expect(evento.entidadId).toBe(creado.id);
      expect(evento.accion).toBe("anticipo_creado");
      expect(evento.datosAnteriores).toBeUndefined();
      expect(evento.datosNuevos).toEqual({
        choferId: "cho-1",
        transportistaId: "tra-1",
        tipoGastoId: "tg-1",
        viajeId: null,
        fecha: new Date("2026-08-01"),
        importe: 1000,
        observaciones: null,
        comprobanteAdjunto: false,
      });
      expect(evento.datosNuevos).not.toHaveProperty("organizacionId");
      expect(evento.datosNuevos).not.toHaveProperty("id");
      expect(evento.datosNuevos).not.toHaveProperty("comprobanteUrl");
      sinUrlEnJson(evento);
    });

    it("con comprobante adjunto al crear: datosNuevos.comprobanteAdjunto = true, la URL nunca aparece", async () => {
      const create = jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...ANTICIPO_BASE, id: "ant-nuevo", ...data, comprobanteUrl: "https://storage.example.com/recibo.pdf?X-Amz-Signature=abc123" }),
      );
      const tx = crearTx({ create });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.create({ ...dto, comprobanteUrl: "https://storage.example.com/recibo.pdf?X-Amz-Signature=abc123" }, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.datosNuevos.comprobanteAdjunto).toBe(true);
      sinUrlEnJson(evento);
    });

    it("si auditLog.create falla, create() se rechaza completo (el anticipo nunca se considera creado)", async () => {
      const tx = crearTx();
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado de auditoría"));
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.create(dto, ACTOR)).rejects.toThrow("fallo simulado de auditoría");
    });

    it("chofer inexistente: rechaza antes de tocar la transacción, sin AuditLog", async () => {
      const tx = crearTx();
      const prisma = crearPrisma(tx, { chofer: jest.fn().mockResolvedValue(null) });
      const controller = new AnticiposController(prisma);

      await expect(controller.create(dto, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.anticipoGasto.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("update()", () => {
    it("edición real genera un único evento 'anticipo_editado' con antes/después de los campos cambiados", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, importe: 1500 });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { importe: 1500 } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("anticipo_editado");
      expect(evento.datosAnteriores).toEqual({ importe: 1000 });
      expect(evento.datosNuevos).toEqual({ importe: 1500 });
    });

    it("PATCH que reenvía exactamente los mismos valores (idempotente) no genera ningún evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { importe: 1000 } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("agregar un comprobante donde no había: comprobanteAdjunto cambia de false a true, sin exponer la URL", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: null });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: "https://storage.example.com/nuevo.pdf?token=xyz" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { comprobanteUrl: "https://storage.example.com/nuevo.pdf?token=xyz" } as any, ACTOR);

      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.datosAnteriores).toEqual({ comprobanteAdjunto: false });
      expect(evento.datosNuevos).toEqual({ comprobanteAdjunto: true });
      sinUrlEnJson(evento);
    });

    it("reemplazar un comprobante por otro (mismo estado 'adjunto') genera evento con marcador comprobanteActualizado, sin guardar ninguna URL", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: "https://storage.example.com/viejo.pdf?sig=aaa" });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: "https://storage.example.com/nuevo.pdf?sig=bbb" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { comprobanteUrl: "https://storage.example.com/nuevo.pdf?sig=bbb" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("anticipo_editado");
      expect(evento.datosAnteriores).toEqual({ comprobanteAdjunto: true });
      expect(evento.datosNuevos).toEqual({ comprobanteAdjunto: true, comprobanteActualizado: true });
      sinUrlEnJson(evento);
    });

    it("reenviar exactamente el mismo comprobante (sin cambio real) no genera evento", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: "https://storage.example.com/igual.pdf?sig=ccc" });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, comprobanteUrl: "https://storage.example.com/igual.pdf?sig=ccc" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { comprobanteUrl: "https://storage.example.com/igual.pdf?sig=ccc" } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("anticipo ya liquidado: rechaza con BadRequestException, sin update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, liquidado: true });
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.update("ant-1", { importe: 1500 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("anticipo inexistente: rechaza con NotFoundException antes de tocar update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.update("ant-x", { importe: 1500 } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, update() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, importe: 1500 });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.update("ant-1", { importe: 1500 } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });

    it("el 'antes' se obtiene del mismo tx aislado por organización — nunca de una lectura manual sin scope", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, importe: 1500 });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.update("ant-1", { importe: 1500 } as any, ACTOR);

      expect(findUnique).toHaveBeenCalledWith({ where: { id: "ant-1" } });
    });
  });

  describe("anular()", () => {
    it("anula el anticipo y genera un único evento 'anticipo_anulado' (incluye anuladoMotivo antes/después)", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "Error de carga" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.anular("ant-1", { motivo: "Error de carga" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("anticipo_anulado");
      expect(evento.datosAnteriores).toEqual({ anulado: false, anuladoMotivo: null, importe: 1000, fecha: ANTICIPO_BASE.fecha });
      expect(evento.datosNuevos).toEqual({ anulado: true, anuladoMotivo: "Error de carga", importe: 1000, fecha: ANTICIPO_BASE.fecha });
    });

    // AUD-1 (corrección post-revisión): "ya anulado" deja de ser un único caso idempotente — se
    // distingue "mismo motivo repetido" (0 eventos) de "motivo realmente distinto" (1 evento).
    it("anular un anticipo ya anulado CON EL MISMO motivo (sin cambio real) no genera un evento fantasma", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "Motivo original" });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "Motivo original" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.anular("ant-1", { motivo: "Motivo original" } as any, ACTOR);

      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("anular un anticipo ya anulado con un motivo DISTINTO genera un evento que muestra el motivo anterior y el nuevo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "Motivo original" });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "Motivo corregido" });
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await controller.anular("ant-1", { motivo: "Motivo corregido" } as any, ACTOR);

      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
      const evento = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
      expect(evento.accion).toBe("anticipo_anulado");
      expect(evento.datosAnteriores.anulado).toBe(true);
      expect(evento.datosAnteriores.anuladoMotivo).toBe("Motivo original");
      expect(evento.datosNuevos.anulado).toBe(true);
      expect(evento.datosNuevos.anuladoMotivo).toBe("Motivo corregido");
    });

    it("sin motivo: rechaza con BadRequestException, sin update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.anular("ant-1", {} as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("anticipo ya liquidado: rechaza con BadRequestException, sin update ni AuditLog", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, liquidado: true });
      const update = jest.fn();
      const tx = crearTx({ findUnique, update });
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.anular("ant-1", { motivo: "x" } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("anticipo inexistente: rechaza con NotFoundException", async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = crearTx({ findUnique });
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.anular("ant-x", { motivo: "x" } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it("si auditLog.create falla, anular() se rechaza completo", async () => {
      const findUnique = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE });
      const update = jest.fn().mockResolvedValue({ ...ANTICIPO_BASE, anulado: true, anuladoMotivo: "x" });
      const tx = crearTx({ findUnique, update });
      (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));
      const controller = new AnticiposController(crearPrisma(tx));

      await expect(controller.anular("ant-1", { motivo: "x" } as any, ACTOR)).rejects.toThrow("fallo simulado");
    });
  });
});
