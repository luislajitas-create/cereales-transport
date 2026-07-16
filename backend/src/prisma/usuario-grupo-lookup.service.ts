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
}
