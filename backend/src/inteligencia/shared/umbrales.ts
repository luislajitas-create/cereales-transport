// Configuración inicial de calibración para las alertas de 7.3.3.a — valores de partida,
// no definiciones permanentes (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 4). Ajustar acá,
// nunca en alertas.calc.ts ni en ningún controller: las fórmulas de severidad no cambian
// cuando estos números cambien.

import { BucketAging } from "../reportes/aging.calc";

export const FACTURA_VENCIDA_SEVERIDAD_POR_BUCKET: Record<BucketAging, "informativa" | "preventiva" | "critica"> = {
  "0-30": "informativa",
  "31-60": "preventiva",
  "61-90": "critica",
  "+90": "critica",
};

export const FACTURA_PROXIMA_VENCER_DIAS_PREVENTIVA = 7;
export const FACTURA_PROXIMA_VENCER_DIAS_CRITICA = 2;

export const CLIENTE_DEUDA_VENCIDA_MONTO_PREVENTIVA = 200000;
export const CLIENTE_DEUDA_VENCIDA_MONTO_CRITICA = 500000;

export const ANTICIPO_SIN_LIQUIDAR_DIAS_INFORMATIVA = 15;
export const ANTICIPO_SIN_LIQUIDAR_DIAS_PREVENTIVA = 31;
export const ANTICIPO_SIN_LIQUIDAR_DIAS_CRITICA = 61;

export const CHOFER_ANTICIPOS_MONTO_PREVENTIVA = 100000;
export const CHOFER_ANTICIPOS_MONTO_CRITICA = 250000;

export const VIAJE_SIN_FACTURAR_DIAS_INFORMATIVA = 0;
export const VIAJE_SIN_FACTURAR_DIAS_PREVENTIVA = 8;
export const VIAJE_SIN_FACTURAR_DIAS_CRITICA = 16;

export const VIAJE_SIN_LIQUIDAR_DIAS_INFORMATIVA = 0;
export const VIAJE_SIN_LIQUIDAR_DIAS_PREVENTIVA = 8;
export const VIAJE_SIN_LIQUIDAR_DIAS_CRITICA = 16;

export const VIAJE_ESTANCADO_DIAS_INFORMATIVA = 3;
export const VIAJE_ESTANCADO_DIAS_PREVENTIVA = 6;
export const VIAJE_ESTANCADO_DIAS_CRITICA = 11;

export const CONCENTRACION_CLIENTE_PCT_PREVENTIVA = 0.25;
export const CONCENTRACION_CLIENTE_PCT_CRITICA = 0.4;
