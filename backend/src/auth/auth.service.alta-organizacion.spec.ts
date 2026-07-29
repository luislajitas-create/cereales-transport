import { BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { NotificadorService } from "../notificaciones/notificador.service";
import { AltaOrganizacionDto } from "./dto/alta-organizacion.dto";

function crearPrismaMock() {
  const tx = {
    organizacion: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "org-1", nombre: "Acme SA", cuit: "20123456786" }),
    },
    usuario: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "user-1", email: "admin@acme.test" }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;
  return { prisma, tx };
}

function dtoValido(): AltaOrganizacionDto {
  return {
    organizacion: { nombre: "Acme SA", cuit: "20123456786" },
    administrador: { nombre: "Admin", email: "admin@acme.test", password: "Password123!" },
  } as AltaOrganizacionDto;
}

describe("AuthService.altaOrganizacion", () => {
  it("honeypot completo: no toca la base y responde éxito falso", async () => {
    const { prisma, tx } = crearPrismaMock();
    const notificador = { enviarBienvenidaOrganizacion: jest.fn() } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    const dto = { ...dtoValido(), sitioWeb: "http://spam.example" };
    const resultado = await service.altaOrganizacion(dto);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.organizacion.create).not.toHaveBeenCalled();
    expect(resultado).toEqual({
      message: "Organización creada correctamente. Ya podés iniciar sesión.",
      organizacion: null,
    });
  });

  it("camino feliz: crea Organizacion + Usuario ADMINISTRADOR + AuditLog en una transacción", async () => {
    const { prisma, tx } = crearPrismaMock();
    const notificador = { enviarBienvenidaOrganizacion: jest.fn().mockResolvedValue(undefined) } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    const resultado = await service.altaOrganizacion(dtoValido());

    expect(tx.organizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nombre: "Acme SA", cuit: "20123456786" }) }),
    );
    expect(tx.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizacionId: "org-1", rol: "ADMINISTRADOR", activo: true, email: "admin@acme.test" }),
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: "organizacion_creada_selfservice", organizacionId: "org-1", usuarioId: "user-1" }),
      }),
    );
    expect(resultado).toEqual({
      message: "Organización creada correctamente. Ya podés iniciar sesión.",
      organizacion: { id: "org-1", nombre: "Acme SA" },
    });
  });

  it("no incluye la contraseña en texto plano en los datos pasados a create", async () => {
    const { prisma, tx } = crearPrismaMock();
    const notificador = { enviarBienvenidaOrganizacion: jest.fn().mockResolvedValue(undefined) } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    await service.altaOrganizacion(dtoValido());

    const dataUsuario = (tx.usuario.create as jest.Mock).mock.calls[0][0].data;
    expect(dataUsuario.passwordHash).toBeDefined();
    expect(dataUsuario.passwordHash).not.toBe("Password123!");
    expect(dataUsuario.password).toBeUndefined();
  });

  it("rechaza con 400 si el CUIT ya está registrado, sin crear el usuario", async () => {
    const { prisma, tx } = crearPrismaMock();
    (tx.organizacion.findUnique as jest.Mock).mockResolvedValue({ id: "org-existente" });
    const notificador = { enviarBienvenidaOrganizacion: jest.fn() } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    await expect(service.altaOrganizacion(dtoValido())).rejects.toThrow(BadRequestException);
    expect(tx.organizacion.create).not.toHaveBeenCalled();
    expect(tx.usuario.create).not.toHaveBeenCalled();
  });

  it("rechaza con 400 si el email ya está registrado, sin crear la organización", async () => {
    const { prisma, tx } = crearPrismaMock();
    (tx.usuario.findUnique as jest.Mock).mockResolvedValue({ id: "usuario-existente" });
    const notificador = { enviarBienvenidaOrganizacion: jest.fn() } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    await expect(service.altaOrganizacion(dtoValido())).rejects.toThrow(BadRequestException);
    // El chequeo de email ocurre antes de crear nada — ni la organización ni el usuario llegan
    // a crearse (y si llegaran a correr en paralelo alguna vez, la transacción los revertiría).
    expect(tx.organizacion.create).not.toHaveBeenCalled();
    expect(tx.usuario.create).not.toHaveBeenCalled();
  });

  it("un fallo del notificador no rompe la respuesta (no bloqueante)", async () => {
    const { prisma } = crearPrismaMock();
    const notificador = {
      enviarBienvenidaOrganizacion: jest.fn().mockRejectedValue(new Error("sin proveedor configurado")),
    } as unknown as NotificadorService;
    const service = new AuthService(prisma, {} as JwtService, notificador);

    const resultado = await service.altaOrganizacion(dtoValido());

    expect(resultado.message).toBe("Organización creada correctamente. Ya podés iniciar sesión.");
  });
});
