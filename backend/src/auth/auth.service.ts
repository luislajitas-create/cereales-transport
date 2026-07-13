import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { hashearToken } from "../administracion/token-utils";

const ENLACE_INVALIDO = "El enlace no es válido o ya expiró.";

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.activo) throw new UnauthorizedException("Credenciales inválidas");
    const ok = await bcrypt.compare(password, usuario.passwordHash);
    if (!ok) throw new UnauthorizedException("Credenciales inválidas");
    if (!usuario.organizacionId) throw new ForbiddenException("Usuario sin organización asignada");

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
      organizacionId: usuario.organizacionId,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: "12h" });
    return {
      accessToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        organizacionId: usuario.organizacionId,
      },
    };
  }

  // Bloque 9.1/9.3 — canje de un token de activación/recuperación. Usa el cliente crudo de
  // Prisma (mismo criterio que login): todavía no existe contexto de organización autenticado
  // en este punto (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5). Mensaje de error idéntico en
  // todos los casos de rechazo — token inexistente, ya usado, expirado, o usuario inactivo —
  // para no revelar cuál de esas condiciones ocurrió.
  async restablecerContrasena(token: string, nuevaContrasena: string) {
    const tokenHash = hashearToken(token);
    const registro = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!registro || registro.usedAt || registro.expiresAt < new Date()) {
      throw new BadRequestException(ENLACE_INVALIDO);
    }

    const usuario = await this.prisma.usuario.findUnique({ where: { id: registro.usuarioId } });
    if (!usuario || !usuario.activo) {
      throw new BadRequestException(ENLACE_INVALIDO);
    }

    const passwordHash = await bcrypt.hash(nuevaContrasena, 10);
    await this.prisma.$transaction([
      this.prisma.usuario.update({ where: { id: usuario.id }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: registro.id }, data: { usedAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          organizacionId: usuario.organizacionId,
          usuarioId: usuario.id,
          entidad: "Usuario",
          entidadId: usuario.id,
          accion: "contrasena_recuperada",
        },
      }),
    ]);
  }
}
