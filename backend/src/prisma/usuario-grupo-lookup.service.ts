import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// Segundo consumidor autorizado del cliente crudo de Prisma (ver el allow-list documentado en
// prisma.module.ts). Única responsabilidad: resolver, para operaciones transversales explícitas
// de Grupo Económico (Bloque 10.3), los datos mínimos de un Usuario que puede pertenecer a
// CUALQUIER organización — el cliente scopeado (ORGANIZACION_PRISMA) nunca puede hacer esto,
// porque filtra Usuario a la organización del contexto activo (organizacion-prisma.client.ts,
// findUnique: descarta el resultado si organizacionId no coincide con el contexto).
//
// Reglas que este archivo respeta y que no deben relajarse sin una nueva decisión explícita:
// nunca expone passwordHash, tokens, ni ningún dato más allá de lo que cada método declara;
// nunca ofrece un método genérico (findMany, where arbitrario) sobre Usuario ni sobre ningún
// otro modelo; cada método nuevo que se agregue acá debe declarar, igual que este, exactamente
// qué operación transversal de Grupo Económico lo necesita.
@Injectable()
export class UsuarioGrupoLookupService {
  constructor(private prisma: PrismaService) {}

  // Bloque 10.3.a — usado exclusivamente por AccesoGrupoController.otorgar() para verificar al
  // destinatario de un acceso de grupo antes de crearlo. Campos mínimos para esa validación:
  // existencia, estado activo, y organización de pertenencia. No incluye rol — Decisión Técnica
  // 1 de Bloque 10.3 (DECISIONES_TECNICAS_BLOQUE10.3.md) ya estableció que el acceso de grupo es
  // independiente del rol funcional del destinatario, así que esta verificación no lo necesita.
  async verificarDestinatario(
    usuarioId: string,
  ): Promise<{ id: string; activo: boolean; organizacionId: string } | null> {
    return this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, activo: true, organizacionId: true },
    });
  }

  // Bloque 10.4.a — usado exclusivamente por AccesoGrupoController.resolverUsuario(), para
  // identificar al destinatario de un futuro otorgamiento sin exigir un UUID a mano
  // (DECISIONES_TECNICAS_BLOQUE10.4.md, Decisión 2). Búsqueda exacta únicamente — nunca parcial,
  // nunca "contiene", nunca listado abierto. Devuelve `null` ante cualquier no-coincidencia
  // (usuario inexistente, inactivo, de otro grupo, o de la propia organización del actor) — el
  // llamador responde siempre el mismo 404 genérico para las cuatro, sin distinguirlas.
  async resolverEnGrupo(
    grupoEconomicoId: string,
    organizacionActorId: string,
    criterio: { email?: string; usuarioId?: string },
  ): Promise<{ id: string; nombre: string; email: string; organizacionId: string; nombreOrganizacion: string } | null> {
    const usuario = criterio.email
      ? await this.prisma.usuario.findUnique({ where: { email: criterio.email } })
      : criterio.usuarioId
        ? await this.prisma.usuario.findUnique({ where: { id: criterio.usuarioId } })
        : null;
    if (!usuario || !usuario.activo) return null;
    if (usuario.organizacionId === organizacionActorId) return null;

    const organizacion = await this.prisma.organizacion.findUnique({ where: { id: usuario.organizacionId } });
    if (!organizacion || organizacion.grupoEconomicoId !== grupoEconomicoId) return null;

    return {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      organizacionId: usuario.organizacionId,
      nombreOrganizacion: organizacion.nombre,
    };
  }

  // Bloque 10.4.a — usado exclusivamente por
  // OrganizacionesAccesiblesController.organizacionesAccesibles(), para obtener la organización
  // de pertenencia REAL del actor (Usuario.organizacionId en base), nunca la organización activa
  // del JWT (actor.organizacionId, ver JwtStrategy). Necesario porque el cliente scopeado
  // (ORGANIZACION_PRISMA) filtra Usuario por el contexto activo (organizacion-prisma.client.ts,
  // findUnique descarta el resultado si organizacionId no coincide) — tras un cambio de
  // organización activa (Bloque 10.3.b) esa consulta devolvería null exactamente en el caso que
  // este endpoint necesita resolver bien.
  async organizacionPropia(usuarioId: string): Promise<{ organizacionId: string } | null> {
    return this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { organizacionId: true },
    });
  }
}
