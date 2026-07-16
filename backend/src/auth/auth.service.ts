import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { generarTokenSeguro, hashearToken } from "../administracion/token-utils";
import { NotificadorService } from "../notificaciones/notificador.service";

const ENLACE_INVALIDO = "El enlace no es válido o ya expiró.";
const TOKEN_RECUPERACION_VIGENCIA_MS = 60 * 60 * 1000; // 60 minutos, mismo criterio que 9.1

// Bloque 10.3.b — mensaje único e idéntico para cualquier motivo de rechazo del cambio de
// organización (usuario inactivo, organización inexistente, sin AccesoGrupoEconomico, grupo
// distinto) — DECISIONES_TECNICAS_BLOQUE10.3b.md, Decisión 5: la respuesta nunca debe revelar
// cuál de esas condiciones ocurrió.
const CAMBIO_ORGANIZACION_DENEGADO = "No tenés autorización para operar esa organización.";

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

  // Bloque 10.3.b — cambia la Organización activa de una sesión ya autenticada, sin volver a
  // pedir contraseña (DISENO_BLOQUE10.3b_CAMBIO_ORGANIZACION.md, sección 1). `tokenActual` es el
  // JWT crudo ya validado por JwtAuthGuard (extraído en el controller) — se usa acá únicamente
  // para leer su `exp` con `this.jwt.decode()` (sin volver a verificar la firma, eso ya lo hizo
  // el guard) y heredarlo en el token nuevo (Decisión Técnica 2 de Bloque 10.3.b): el cambio de
  // organización nunca reinicia ni extiende la sesión.
  //
  // Validaciones en el orden exacto ya aprobado (Decisión Técnica 1: la lógica vive acá, no en
  // un guard separado — evita depender de ORGANIZACION_PRISMA/AsyncLocalStorage, que un guard
  // no podría usar de forma confiable porque los guards de Nest corren antes que los
  // interceptors, y es OrganizacionContextInterceptor el que siembra ese contexto). Todas las
  // consultas usan el cliente crudo, exactamente igual que login() — AuthService ya está en el
  // allow-list de PrismaService crudo (ver prisma.module.ts), y acá tampoco existe todavía un
  // contexto de organización de destino sobre el cual apoyarse.
  async cambiarOrganizacion(actor: { id: string; organizacionId: string }, organizacionIdDestino: string, tokenActual: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: actor.id } });
    if (!usuario) {
      await this.registrarIntentoDenegado(actor.organizacionId, actor.id);
      throw new ForbiddenException(CAMBIO_ORGANIZACION_DENEGADO);
    }
    if (!usuario.activo) {
      await this.registrarIntentoDenegado(usuario.organizacionId, usuario.id);
      throw new ForbiddenException(CAMBIO_ORGANIZACION_DENEGADO);
    }

    const organizacionDestino = await this.prisma.organizacion.findUnique({ where: { id: organizacionIdDestino } });
    if (!organizacionDestino) {
      await this.registrarIntentoDenegado(usuario.organizacionId, usuario.id);
      throw new ForbiddenException(CAMBIO_ORGANIZACION_DENEGADO);
    }

    const esPropiaOrganizacion = organizacionIdDestino === usuario.organizacionId;
    if (!esPropiaOrganizacion) {
      const acceso = await this.prisma.accesoGrupoEconomico.findUnique({
        where: { usuarioId_organizacionId: { usuarioId: usuario.id, organizacionId: organizacionIdDestino } },
      });
      if (!acceso) {
        await this.registrarIntentoDenegado(usuario.organizacionId, usuario.id);
        throw new ForbiddenException(CAMBIO_ORGANIZACION_DENEGADO);
      }

      // Revalidado en cada uso, nunca asumido desde el momento en que se otorgó el acceso
      // (DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md, sección 1) — no aplica al caso de "volver a
      // la propia organización", que siempre está permitido sin depender de ningún grupo.
      const organizacionOrigen = await this.prisma.organizacion.findUnique({ where: { id: usuario.organizacionId } });
      const mismoGrupo =
        organizacionOrigen?.grupoEconomicoId != null &&
        organizacionOrigen.grupoEconomicoId === organizacionDestino.grupoEconomicoId;
      if (!mismoGrupo) {
        await this.registrarIntentoDenegado(usuario.organizacionId, usuario.id);
        throw new ForbiddenException(CAMBIO_ORGANIZACION_DENEGADO);
      }
    }

    const { exp } = this.jwt.decode(tokenActual) as { exp?: number };
    const segundosRestantes = (exp ?? 0) - Math.floor(Date.now() / 1000);
    if (!exp || segundosRestantes <= 0) {
      throw new UnauthorizedException("La sesión actual ya expiró.");
    }

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      rol: usuario.rol,
      nombre: usuario.nombre,
      organizacionId: organizacionIdDestino,
    };
    const accessToken = this.jwt.sign(payload, { expiresIn: segundosRestantes });

    const organizacionOrigenId = usuario.organizacionId;
    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: {
          organizacionId: organizacionOrigenId,
          usuarioId: usuario.id,
          entidad: "Usuario",
          entidadId: usuario.id,
          accion: "organizacion_activa_cambiada",
          datosNuevos: { organizacionDestinoId: organizacionIdDestino },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          organizacionId: organizacionIdDestino,
          // AuditLog.usuario es una FK compuesta ([usuarioId, organizacionId] -> Usuario[id,
          // organizacionId]) — nunca puede apuntar a un Usuario cuya organización de pertenencia
          // real sea otra (acá, siempre la de origen). Mismo motivo estructural, ya resuelto en
          // Bloque 10.2, por el que IdentidadChoferGrupo.creadoPorId es un String suelto sin
          // relación: el "quién" cruzado se conserva como dato plano en datosAnteriores, nunca
          // como una FK que la base rechazaría (verificado: un intento de setear usuarioId acá
          // con el id real del usuario cruzado produce P2003, "uno de los datos referenciados no
          // existe" — no hay ningún Usuario con [id, organizacionIdDestino] real).
          usuarioId: null,
          entidad: "Usuario",
          entidadId: usuario.id,
          accion: "organizacion_activa_cambiada",
          datosAnteriores: { organizacionOrigenId, usuarioId: usuario.id },
        },
      }),
    ]);

    return {
      accessToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        organizacionId: organizacionIdDestino,
      },
    };
  }

  // Bloque 10.3.b, Decisión Técnica 5 — best-effort, deliberadamente: un fallo al escribir esta
  // auditoría nunca debe impedir ni alterar el rechazo real. Por eso el error se traga acá
  // adentro — quien llama a este método siempre sigue con su propio `throw ForbiddenException`
  // después, pase lo que pase con este intento de registro. Nunca conserva datos de la
  // organización destino (nombre, CUIT, ni siquiera su id) — solo la organización de origen y el
  // usuario que lo intentó, exactamente lo que la Decisión Técnica 5 permite conservar.
  private async registrarIntentoDenegado(organizacionOrigenId: string, usuarioId: string): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizacionId: organizacionOrigenId,
          usuarioId,
          entidad: "Usuario",
          entidadId: usuarioId,
          accion: "intento_cambio_organizacion_denegado",
        },
      });
    } catch {
      // Silenciado a propósito — ver comentario del método.
    }
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
