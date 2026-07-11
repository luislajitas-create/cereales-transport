// Semántica compartida — severidad de alertas (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 7).
// Ocho de las nueve alertas de 7.3.3.a necesitan la misma operación: clasificar un valor
// en tres niveles según dos umbrales. Se extrae acá antes de escribir la primera
// duplicación (BLOQUE7.3.0_MOTOR_DE_INTELIGENCIA.md, regla 8).

export type Severidad = "informativa" | "preventiva" | "critica";

// Para valores donde "más" es peor (días de mora, monto acumulado, % de concentración).
export function severidadPorUmbral(valor: number, umbralPreventiva: number, umbralCritica: number): Severidad {
  if (valor >= umbralCritica) return "critica";
  if (valor >= umbralPreventiva) return "preventiva";
  return "informativa";
}

// Para valores donde "menos" es peor (días que faltan para vencer). No es una fórmula
// nueva — es la misma comparación de severidadPorUmbral, con el sentido de la desigualdad
// invertido porque acá acercarse a cero es lo que escala la severidad, no alejarse de él.
export function severidadPorUmbralDescendente(valor: number, umbralPreventiva: number, umbralCritica: number): Severidad {
  if (valor <= umbralCritica) return "critica";
  if (valor <= umbralPreventiva) return "preventiva";
  return "informativa";
}
