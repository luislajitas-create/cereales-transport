// Bloque H-6 (AUDITORIA_VIAJES2.0_RC1.md, §16): orden secuencial de avance de un Viaje activo —
// deliberadamente excluye "CANCELADO" (no es parte de esta secuencia lineal; se llega por
// cancelar(), no por cambiarEstado()). Antes duplicado, idéntico, en Viajes.tsx y
// ViajeDetalle.tsx; centralizado acá para que ambos importen la misma fuente. El backend
// (viajes.controller.ts) mantiene su propia copia — no hay paquete compartido entre backend y
// frontend en este proyecto (dos npm projects separados, sin workspaces), y esta constante ya
// era de un solo lugar ahí (usada solo dentro de ese mismo archivo).
export const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];
