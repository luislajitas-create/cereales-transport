import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { generarTokenSeguro, hashearToken } from "../administracion/token-utils";
import { NotificadorService } from "../notificaciones/notificador.service";

const ENLACE_INVALIDO = "El enlace no es válido o ya expiró.";
const TOKEN_RECUPERACION_VIGENCIA_MS = 60 * 60 * 1000; // 60 minutos, mismo criterio que 9.1

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private notificador: NotificadorService) {}

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

  // Bloque 9.3 — solicitud de recuperación. Siempre resuelve sin error y sin distinguir si el
  // email existe (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5) — el controller responde el mismo
  // mensaje genérico en ambos casos. Solo si el usuario existe y está activo se genera el token
  // y se registra el AuditLog; nunca se revela esa condición a quien hizo la solicitud.
  async recuperarContrasena(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !usuario.activo) return;

    const { token, tokenHash } = generarTokenSeguro();
    await this.prisma.passwordResetToken.create({
      data: {
        organizacionId: usuario.organizacionId,
        usuarioId: usuario.id,
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_RECUPERACION_VIGENCIA_MS),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizacionId: usuario.organizacionId,
        usuarioId: usuario.id,
        entidad: "Usuario",
        entidadId: usuario.id,
        accion: "recuperacion_contrasena_solicitada",
      },
    });

    const enlace = `${process.env.CORS_ORIGIN}/restablecer-contrasena?token=${token}`;
    await this.notificador.enviarRecuperacionContrasena(usuario.email, enlace);
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

  // Bloque 9.6 (mitad pública) — datos mínimos para el formulario de aceptación
  // (BLOQUE9_DISENO_ADMINISTRACION.md, sección 5): nombre de la organización y el email de la
  // invitación, nada más.
  async obtenerInvitacion(token: string) {
    const invitacion = await this.buscarInvitacionValida(token);
    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: invitacion.organizacionId },
      select: { nombre: true },
    });
    return { organizacion: organizacion?.nombre ?? null, email: invitacion.email };
  }

  // Bloque 9.6 — el Usuario real se crea acá, recién al aceptar, nunca antes (sección 5,
  // "Decisión recomendada"). Todo dentro de una transacción: si dos invitaciones a distintas
  // organizaciones llegaran a competir por el mismo email, la unicidad global de Usuario.email
  // (schema.prisma) rechaza la segunda con P2002 (mapeado a 409 por PrismaExceptionFilter) —
  // el check explícito de abajo solo mejora el mensaje en el caso común, no reemplaza esa garantía.
  async aceptarInvitacion(token: string, nuevaContrasena: string): Promise<void> {
    const invitacion = await this.buscarInvitacionValida(token);
    const passwordHash = await bcrypt.hash(nuevaContrasena, 10);

    await this.prisma.$transaction(async (tx) => {
      const emailYaUsado = await tx.usuario.findUnique({ where: { email: invitacion.email } });
      if (emailYaUsado) {
        throw new BadRequestException("Ya existe una cuenta con ese email. Iniciá sesión o recuperá tu acceso.");
      }

      const usuario = await tx.usuario.create({
        data: {
          organizacionId: invitacion.organizacionId,
          nombre: invitacion.nombre,
          email: invitacion.email,
          rol: invitacion.rol,
          activo: true,
          passwordHash,
        },
      });

      await tx.invitacionUsuario.update({ where: { id: invitacion.id }, data: { aceptadaEn: new Date() } });

      // Cualquier otra invitación pendiente para el mismo email (de cualquier organización)
      // queda sin efecto: ya existe una cuenta real, no hay nada más que aceptar.
      await tx.invitacionUsuario.deleteMany({
        where: { email: invitacion.email, aceptadaEn: null, id: { not: invitacion.id } },
      });

      await tx.auditLog.create({
        data: {
          organizacionId: invitacion.organizacionId,
          usuarioId: usuario.id,
          entidad: "Usuario",
          entidadId: usuario.id,
          accion: "invitacion_aceptada",
        },
      });
    });
  }

  private async buscarInvitacionValida(token: string) {
    const tokenHash = hashearToken(token);
    const invitacion = await this.prisma.invitacionUsuario.findUnique({ where: { tokenHash } });
    if (!invitacion || invitacion.aceptadaEn || invitacion.expiresAt < new Date()) {
      throw new BadRequestException(ENLACE_INVALIDO);
    }
    return invitacion;
  }
}
