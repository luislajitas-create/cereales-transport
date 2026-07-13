import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";
import { crearClienteOrganizacional } from "./organizacion-prisma.client";
import { ORGANIZACION_PRISMA } from "./organizacion-prisma.token";
import { OrganizacionContextInterceptor } from "./organizacion-context.interceptor";

// Único punto de acceso a datos organizacionales para módulos funcionales. Global a propósito:
// lo que se expone acá es siempre el cliente ya scopeado por organización, nunca el crudo
// (PrismaService deja de ser global en prisma.module.ts) — exportarlo ampliamente no reabre
// el bypass que cierra 8.1.d.
//
// Refinación arquitectónica (revisión aprobada, reemplaza el Provider request-scoped + Proxy
// de la primera versión): ORGANIZACION_PRISMA vuelve a ser un singleton (scope por defecto) —
// se construye una sola vez al arrancar la app. El contexto organizacional lo siembra
// OrganizacionContextInterceptor (global, corre después de los guards) y lo lee cada handler
// de la extensión desde AsyncLocalStorage en el momento exacto de cada query
// (organizacion-context.ts). Ningún controller ni servicio funcional cambia: la interfaz
// pública del token es exactamente la misma.
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: ORGANIZACION_PRISMA,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => crearClienteOrganizacional(prisma),
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: OrganizacionContextInterceptor,
    },
  ],
  exports: [ORGANIZACION_PRISMA],
})
export class OrganizacionPrismaModule {}
