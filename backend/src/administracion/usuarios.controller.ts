import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { generarTokenSeguro } from "./token-utils";
import { CreateUsuarioDto } from "./dto/create-usuario.dto";
import { UpdateUsuarioDto } from "./dto/update-usuario.dto";
import { UpdateEstadoUsuarioDto } from "./dto/update-estado-usuario.dto";

const TOKEN_ACTIVACION_VIGENCIA_MS = 60 * 60 * 1000; // 60 minutos

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("usuarios")
export class UsuariosController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  findAll() {
    return this.prisma.usuario.findMany({
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
      orderBy: { nombre: "asc" },
    });
  }

  @Roles("ADMINISTRADOR")
  @Post()
  async create(@Body() body: CreateUsuarioDto, @CurrentUser() actor: any) {
    // Bloque 9.1: el usuario se crea sin contraseña utilizable — un valor aleatorio que nadie
    // conoce ni puede derivar. La contraseña real la define quien lo reciba, al canjear el
    // token de activación (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5). No se expone ni se
    // genera ninguna contraseña en texto plano en ningún momento.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
    const nuevoUsuario = await this.prisma.usuario.create({
      data: { nombre: body.nombre, email: body.email, rol: body.rol, passwordHash },
    });

    const { token, tokenHash } = generarTokenSeguro();
    await this.prisma.passwordResetToken.create({
      data: {
        usuarioId: nuevoUsuario.id,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_ACTIVACION_VIGENCIA_MS),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        usuarioId: actor.id,
        entidad: "Usuario",
        entidadId: nuevoUsuario.id,
        accion: "usuario_creado",
        datosNuevos: { nombre: body.nombre, email: body.email, rol: body.rol },
      },
    });

    return {
      usuario: {
        id: nuevoUsuario.id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        rol: nuevoUsuario.rol,
        activo: nuevoUsuario.activo,
      },
      tokenActivacion: token,
    };
  }

  @Roles("ADMINISTRADOR")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: UpdateUsuarioDto, @CurrentUser() actor: any) {
    const actual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Usuario no encontrado");

    const cambiaRolFueraDeAdministrador =
      body.rol !== undefined && body.rol !== "ADMINISTRADOR" && actual.rol === "ADMINISTRADOR";
    if (cambiaRolFueraDeAdministrador) {
      await this.asegurarNoEsUltimoAdministrador(actual.id, actor);
    }

    const actualizado = await this.prisma.usuario.update({
      where: { id },
      data: { nombre: body.nombre, email: body.email, rol: body.rol },
    });

    await this.prisma.auditLog.create({
      data: {
        usuarioId: actor.id,
        entidad: "Usuario",
        entidadId: id,
        accion: body.rol !== undefined && body.rol !== actual.rol ? "usuario_rol_cambiado" : "usuario_editado",
        datosAnteriores: { nombre: actual.nombre, email: actual.email, rol: actual.rol },
        datosNuevos: { nombre: actualizado.nombre, email: actualizado.email, rol: actualizado.rol },
      },
    });

    return { id: actualizado.id, nombre: actualizado.nombre, email: actualizado.email, rol: actualizado.rol, activo: actualizado.activo };
  }

  @Roles("ADMINISTRADOR")
  @Patch(":id/activo")
  async cambiarEstado(@Param("id") id: string, @Body() body: UpdateEstadoUsuarioDto, @CurrentUser() actor: any) {
    const actual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Usuario no encontrado");

    if (body.activo === false && actual.rol === "ADMINISTRADOR") {
      await this.asegurarNoEsUltimoAdministrador(actual.id, actor);
    }

    const actualizado = await this.prisma.usuario.update({ where: { id }, data: { activo: body.activo } });

    await this.prisma.auditLog.create({
      data: {
        usuarioId: actor.id,
        entidad: "Usuario",
        entidadId: id,
        accion: body.activo ? "usuario_activado" : "usuario_desactivado",
      },
    });

    return { id: actualizado.id, nombre: actualizado.nombre, email: actualizado.email, rol: actualizado.rol, activo: actualizado.activo };
  }

  @Roles("ADMINISTRADOR")
  @Post(":id/restablecer-acceso")
  async restablecerAcceso(@Param("id") id: string, @CurrentUser() actor: any) {
    const actual = await this.prisma.usuario.findUnique({ where: { id } });
    if (!actual) throw new NotFoundException("Usuario no encontrado");

    const { token, tokenHash } = generarTokenSeguro();
    await this.prisma.passwordResetToken.create({
      data: { usuarioId: id, tokenHash, expiresAt: new Date(Date.now() + TOKEN_ACTIVACION_VIGENCIA_MS) },
    });

    await this.prisma.auditLog.create({
      data: { usuarioId: actor.id, entidad: "Usuario", entidadId: id, accion: "usuario_acceso_restablecido" },
    });

    return { tokenActivacion: token };
  }

  // Bloque 9.1: protección del último administrador activo (BLOQUE9_DISENO_ADMINISTRACION.md,
  // sección 6) — se verifica en el propio endpoint, no se delega a la base.
  private async asegurarNoEsUltimoAdministrador(usuarioId: string, actor: any) {
    const otrosAdministradoresActivos = await this.prisma.usuario.count({
      where: { rol: "ADMINISTRADOR", activo: true, id: { not: usuarioId } },
    });
    if (otrosAdministradoresActivos === 0) {
      await this.prisma.auditLog.create({
        data: {
          usuarioId: actor.id,
          entidad: "Usuario",
          entidadId: usuarioId,
          accion: "operacion_administrativa_rechazada",
          datosNuevos: { motivo: "ultimo_administrador_activo" },
        },
      });
      throw new BadRequestException(
        "No se puede completar la operación: la organización quedaría sin ningún administrador activo.",
      );
    }
  }
}
