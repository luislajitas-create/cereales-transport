import { BadRequestException, Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { UpdatePerfilDto } from "./dto/update-perfil.dto";
import { CambiarContrasenaPropiaDto } from "./dto/cambiar-contrasena-propia.dto";

// Bloque 9.2 — perfil del propio usuario autenticado. Nunca opera sobre otro usuario: el id
// siempre se toma de @CurrentUser(), nunca de un parámetro de la URL. email queda fuera de
// alcance a propósito (ver commit): sin un mecanismo de verificación de email todavía, un
// cambio de email autoservicio sobre una sesión comprometida habilitaría una toma de cuenta
// permanente combinada con la recuperación de contraseña ya vigente (9.3).
@UseGuards(JwtAuthGuard)
@Controller("perfil")
export class PerfilController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  @Get()
  async obtenerPerfil(@CurrentUser() actor: any) {
    return this.prisma.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, nombre: true, email: true, rol: true, organizacionId: true, activo: true },
    });
  }

  @Patch()
  async actualizarPerfil(@Body() body: UpdatePerfilDto, @CurrentUser() actor: any) {
    const anterior = await this.prisma.usuario.findUnique({ where: { id: actor.id }, select: { nombre: true } });

    const actualizado = await this.prisma.usuario.update({
      where: { id: actor.id },
      data: { nombre: body.nombre },
      select: { id: true, nombre: true, email: true, rol: true, organizacionId: true, activo: true },
    });

    await this.prisma.auditLog.create({
      data: {
        usuarioId: actor.id,
        entidad: "Usuario",
        entidadId: actor.id,
        accion: "perfil_editado",
        datosAnteriores: { nombre: anterior?.nombre },
        datosNuevos: { nombre: actualizado.nombre },
      },
    });

    return actualizado;
  }

  @Patch("contrasena")
  async cambiarContrasena(@Body() body: CambiarContrasenaPropiaDto, @CurrentUser() actor: any) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, passwordHash: true },
    });
    if (!usuario) throw new BadRequestException("No se pudo completar la operación.");

    const actualEsCorrecta = await bcrypt.compare(body.contrasenaActual, usuario.passwordHash);
    if (!actualEsCorrecta) throw new BadRequestException("La contraseña actual no es correcta.");

    const esLaMisma = await bcrypt.compare(body.contrasenaNueva, usuario.passwordHash);
    if (esLaMisma) throw new BadRequestException("La contraseña nueva debe ser distinta de la actual.");

    const passwordHash = await bcrypt.hash(body.contrasenaNueva, 10);
    await this.prisma.usuario.update({ where: { id: actor.id }, data: { passwordHash } });

    // No se invalidan los JWT ya emitidos — arquitectura stateless ya aprobada
    // (BLOQUE9_DISENO_ADMINISTRACION.md, Decisión 2). El riesgo queda acotado a la
    // expiración natural del token (12 horas), documentado y aceptado.
    await this.prisma.auditLog.create({
      data: { usuarioId: actor.id, entidad: "Usuario", entidadId: actor.id, accion: "contrasena_cambiada" },
    });

    return { message: "Contraseña actualizada correctamente." };
  }
}
