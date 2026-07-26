// Registro paralelo a ORGANIZACIONAL_MODELS (Bloque 11, H-04). Modelos que tienen
// organizacionId pero se aíslan MANUALMENTE, a propósito — su función es cruzar
// organizaciones, así que auto-limitarlos a la organización del actor (como hace la
// extensión de organizacion-prisma.client.ts para ORGANIZACIONAL_MODELS) les impediría
// cumplir su propio propósito. Cada exclusión ya está documentada en el comentario del
// modelo correspondiente en schema.prisma — este archivo la consolida en un único lugar
// para que organizacional-models.spec.ts pueda verificarla contra el schema real.
export const MODELOS_AISLAMIENTO_MANUAL = [
  // Es, en sí mismo, el mecanismo de acceso cruzado entre organizaciones del mismo grupo
  // económico (schema.prisma, comentario de AccesoGrupoEconomico: "mismo tratamiento que
  // GrupoEconomico e IdentidadChoferGrupo, aislamiento manual, nunca por la extensión de
  // Prisma"). Cada consulta se filtra manualmente por organizacionId en
  // acceso-grupo.controller.ts.
  "AccesoGrupoEconomico",
  // Une, dentro de un PagoConsolidado, liquidaciones de organizaciones distintas del mismo
  // grupo económico (schema.prisma, comentario de PagoConsolidadoLiquidacion: "no es
  // organizacional — une organizaciones distintas, no podría serlo"). El acceso cruzado se
  // hace vía cambio explícito de contexto (organizacionContextStorage.run) en
  // pago-consolidado.service.ts.
  "PagoConsolidadoLiquidacion",
] as const;
