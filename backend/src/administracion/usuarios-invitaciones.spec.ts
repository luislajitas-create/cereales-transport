import { BadRequestException, NotFoundException } from "@nestjs/common";
import { UsuariosController } from "./usuarios.controller";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { NotificadorService } from "../notificaciones/notificador.service";

function crearPrismaMock() {
  return {
    invitacionUsuario: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  } as unknown as OrganizacionPrismaClient;
}

const ACTOR = { id: "actor-1", rol: "ADMINISTRADOR", organizacionId: "org-1" };

describe("UsuariosController — invitaciones pendientes", () => {
  it("listarInvitacionesPendientes filtra por aceptadaEn: null", async () => {
    const prisma = crearPrismaMock();
    (prisma.invitacionUsuario.findMany as jest.Mock).mockResolvedValue([]);
    const controller = new UsuariosController(prisma, {} as NotificadorService);

    await controller.listarInvitacionesPendientes();

    expect(prisma.invitacionUsuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { aceptadaEn: null } }),
    );
  });

  it("cancelarInvitacion lanza NotFoundException si no existe", async () => {
    const prisma = crearPrismaMock();
    (prisma.invitacionUsuario.findUnique as jest.Mock).mockResolvedValue(null);
    const controller = new UsuariosController(prisma, {} as NotificadorService);

    await expect(controller.cancelarInvitacion("no-existe", ACTOR)).rejects.toThrow(NotFoundException);
    expect(prisma.invitacionUsuario.delete).not.toHaveBeenCalled();
  });

  it("cancelarInvitacion lanza BadRequestException si ya fue aceptada", async () => {
    const prisma = crearPrismaMock();
    (prisma.invitacionUsuario.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      email: "x@x.com",
      nombre: "X",
      rol: "LECTURA",
      aceptadaEn: new Date(),
    });
    const controller = new UsuariosController(prisma, {} as NotificadorService);

    await expect(controller.cancelarInvitacion("inv-1", ACTOR)).rejects.toThrow(BadRequestException);
    expect(prisma.invitacionUsuario.delete).not.toHaveBeenCalled();
  });

  it("cancelarInvitacion elimina y registra AuditLog cuando está pendiente", async () => {
    const prisma = crearPrismaMock();
    (prisma.invitacionUsuario.findUnique as jest.Mock).mockResolvedValue({
      id: "inv-1",
      email: "x@x.com",
      nombre: "X",
      rol: "LECTURA",
      aceptadaEn: null,
    });
    const controller = new UsuariosController(prisma, {} as NotificadorService);

    const resultado = await controller.cancelarInvitacion("inv-1", ACTOR);

    expect(prisma.invitacionUsuario.delete).toHaveBeenCalledWith({ where: { id: "inv-1" } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: "invitacion_cancelada", entidadId: "inv-1" }),
      }),
    );
    expect(resultado).toEqual({ message: "Invitación cancelada." });
  });
});
