import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { UsuarioGrupoLookupService } from "../prisma/usuario-grupo-lookup.service";

// Bloque 10.4.a — único endpoint de todo el módulo grupo-economico sin RolesGuard, a propósito:
// vive en un controller propio, sin RolesGuard a nivel de clase (NestJS apila guards, no se
// puede "quitar" uno heredado a nivel de método) — el acceso de grupo es independiente del rol
// funcional (DECISIONES_TECNICAS_BLOQUE10.3.md, Decisión 3), así que un usuario con
// AccesoGrupoEconomico pero sin rol ADMINISTRADOR también necesita poder consultar a qué
// organizaciones puede cambiar (DECISIONES_TECNICAS_BLOQUE10.4.md, Decisión 1).
//
// La organización de pertenencia ("propia") se obtiene vía UsuarioGrupoLookupService (Prisma
// crudo), nunca desde actor.organizacionId ni desde el cliente scopeado: tras un cambio de
// organización activa (Bloque 10.3.b) actor.organizacionId refleja el CONTEXTO ACTUAL del JWT,
// no la organización de pertenencia real del Usuario — y el cliente scopeado filtraría Usuario
// por ese mismo contexto activo, devolviendo null exactamente en ese caso (ver
// organizacion-prisma.client.ts, findUnique). `esActual` se calcula aparte, comparando cada
// organización candidata contra actor.organizacionId — puede corresponder a la propia o a una
// adicional, nunca a ambas ni a ninguna.
@UseGuards(JwtAuthGuard)
@Controller("grupo-economico")
export class OrganizacionesAccesiblesController {
  constructor(
    @Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient,
    private usuarioLookup: UsuarioGrupoLookupService,
  ) {}

  @Get("organizaciones-accesibles")
  async organizacionesAccesibles(@CurrentUser() actor: any) {
    const usuario = await this.usuarioLookup.organizacionPropia(actor.id);
    if (!usuario) return [];

    const propia = await this.prisma.organizacion.findUnique({
      where: { id: usuario.organizacionId },
      select: { id: true, nombre: true, grupoEconomicoId: true },
    });
    if (!propia) return [];

    const accesos = await this.prisma.accesoGrupoEconomico.findMany({
      where: { usuarioId: actor.id },
      select: { organizacion: { select: { id: true, nombre: true, grupoEconomicoId: true } } },
    });

    // Revalidado en cada consulta, igual que en AuthService.cambiarOrganizacion() — nunca se
    // asume que un acceso otorgado sigue siendo válido solo porque la fila existe.
    const adicionales = accesos
      .map((a) => a.organizacion)
      .filter((org) => propia.grupoEconomicoId != null && org.grupoEconomicoId === propia.grupoEconomicoId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return [
      { id: propia.id, nombre: propia.nombre, esActual: propia.id === actor.organizacionId },
      ...adicionales.map((org) => ({ id: org.id, nombre: org.nombre, esActual: org.id === actor.organizacionId })),
    ];
  }
}
