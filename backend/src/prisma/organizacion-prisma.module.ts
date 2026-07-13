import { Global, Module, Scope, UnauthorizedException } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";
import { crearClienteOrganizacional } from "./organizacion-prisma.client";
import { ORGANIZACION_PRISMA } from "./organizacion-prisma.token";

// Único punto de acceso a datos organizacionales para módulos funcionales. Global a propósito:
// lo que se expone acá es siempre el cliente ya scopeado por organización, nunca el crudo
// (PrismaService deja de ser global en prisma.module.ts) — exportarlo ampliamente no reabre
// el bypass que cierra 8.1.d.
//
// La resolución de organizacionId es perezosa (Proxy), no en el momento de construir el
// provider: Nest instancia los providers request-scoped inyectados por constructor como parte
// de armar el contexto del controller, ANTES de que los guards (JwtAuthGuard/RolesGuard)
// terminen de correr y completen request.user — leer request.user acá adentro, en frío,
// siempre lo encuentra vacío. El Proxy difiere la lectura hasta el primer uso real
// (this.prisma.cliente.findMany(...) dentro del método del controller), momento en el que los
// guards ya garantizadamente terminaron.
function crearClienteOrganizacionalPerezoso(request: any, prisma: PrismaService) {
  let clienteReal: ReturnType<typeof crearClienteOrganizacional> | undefined;
  function resolver() {
    if (!clienteReal) {
      const organizacionId = request?.user?.organizacionId;
      if (typeof organizacionId !== "string" || organizacionId.length === 0) {
        throw new UnauthorizedException("Sin contexto de organización");
      }
      clienteReal = crearClienteOrganizacional(prisma, organizacionId);
    }
    return clienteReal;
  }
  return new Proxy(
    {},
    {
      get(_target, prop) {
        // Nest (y cualquier `await`) sondea la propiedad "then" para decidir si el valor
        // devuelto por el factory es una promesa — sin este corte explícito, ese sondeo
        // dispara la resolución real antes de que los guards terminen de correr.
        if (prop === "then") return undefined;
        const valor = (resolver() as any)[prop];
        return typeof valor === "function" ? valor.bind(clienteReal) : valor;
      },
    },
  );
}

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: ORGANIZACION_PRISMA,
      scope: Scope.REQUEST,
      inject: [REQUEST, PrismaService],
      useFactory: (request: any, prisma: PrismaService) => crearClienteOrganizacionalPerezoso(request, prisma),
    },
  ],
  exports: [ORGANIZACION_PRISMA],
})
export class OrganizacionPrismaModule {}
