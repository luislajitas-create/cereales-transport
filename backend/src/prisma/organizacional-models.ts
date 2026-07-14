// Lista única de los 20 modelos organizacionales (Bloque 8.1, Backfill cerrado en
// c992a18/a9127df/9fdbc97/b31c238). Cualquier modelo nuevo que dependa de una organización
// debe agregarse acá — es la única fuente que usa la extensión de aislamiento de Prisma
// (organizacion-prisma.client.ts) para decidir a qué modelos les aplica el scoping.
export const ORGANIZACIONAL_MODELS = [
  "Usuario",
  "Cliente",
  "Contacto",
  "Productor",
  "Transportista",
  "Chofer",
  "Vehiculo",
  "Cereal",
  "Ubicacion",
  "TipoGasto",
  "Viaje",
  "HistorialEstadoViaje",
  "AnticipoGasto",
  "Liquidacion",
  "LiquidacionViaje",
  "LiquidacionMovimiento",
  "Factura",
  "FacturaViaje",
  "Cobranza",
  "AuditLog",
  "PasswordResetToken",
  "InvitacionUsuario",
] as const;

export function esModeloOrganizacional(model: string | undefined): boolean {
  return !!model && (ORGANIZACIONAL_MODELS as readonly string[]).includes(model);
}
