import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// Ya no es @Global() (Bloque 8.1.d): el cliente crudo solo debe llegar a quien lo importe
// explícitamente. Allow-list completo de consumidores autorizados, a 2026-07-16:
//   1. AuthModule — necesita leer Usuario antes de que exista contexto de organización (login).
//   2. UsuarioGrupoLookupModule (Bloque 10.3.a, DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md,
//      sección 1) — único componente autorizado a leer Usuario de CUALQUIER organización, para
//      operaciones transversales explícitas de Grupo Económico (ver
//      usuario-grupo-lookup.service.ts). Expone solo métodos de negocio estrechos, nunca el
//      cliente Prisma en sí — ningún otro módulo puede terminar con el crudo por importar este.
//   3. OrganizacionPrismaModule — lo envuelve con el scoping automático (ORGANIZACION_PRISMA),
//      el único cliente que debe llegar a cualquier otro módulo funcional del sistema.
// Ningún otro módulo debe importar este módulo directamente. Verificar el allow-list con:
//   grep -rnE ": PrismaService[,)]|inject: \[PrismaService\]" backend/src --include=*.ts
// (acota a una anotación de tipo real — constructor o parámetro de función — o al array
// `inject`; una búsqueda de solo "PrismaService" sin acotar también encuentra comentarios que
// solo lo mencionan, y el módulo _combustibles.disabled/ — código deshabilitado, nunca
// importado por app.module.ts, sin efecto en runtime, pero SÍ coincide con este patrón porque
// tiene una inyección de constructor real: hay que descartarlo a mano, no lo excluye el grep).
// Los resultados reales, verificados el 2026-07-16, son exactamente: auth.service.ts,
// usuario-grupo-lookup.service.ts, organizacion-prisma.client.ts (parámetro de la factory),
// y organizacion-prisma.module.ts (dos coincidencias: el array `inject` y el parámetro del
// propio `useFactory`) — ningún otro módulo activo.
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
