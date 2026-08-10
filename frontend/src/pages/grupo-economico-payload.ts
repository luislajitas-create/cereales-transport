// GAP-GE-1: lógica pura del flujo "crear/unirse a un Grupo Económico" (GrupoEconomico.tsx),
// separada del componente por el mismo motivo que alta-organizacion-payload.ts.
//
// El backend identifica un Grupo Económico por su `id` real (uuid). En la interfaz nunca se lo
// llama "id" ni "UUID" — se lo muestra como "Código del Grupo Económico" (ver GrupoEconomico.tsx),
// una decisión puramente de presentación: no se toca el schema ni el contrato de los endpoints
// existentes (POST /grupo-economico, POST /grupo-economico/:id/organizaciones).

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizarCodigoGrupo(codigo: string): string {
  return codigo.trim();
}

// Chequeo de formato en el cliente, solo para dar feedback inmediato antes de llamar al
// backend — la validación real (que el grupo exista y que la organización pueda unirse) sigue
// siendo enteramente responsabilidad del backend (GrupoEconomicoController.asociar()).
export function esFormatoCodigoGrupoValido(codigo: string): boolean {
  return FORMATO_UUID.test(normalizarCodigoGrupo(codigo));
}

export function validarNombreGrupo(nombre: string): string | null {
  const recortado = nombre.trim();
  if (recortado === "") return "Ingresá un nombre para el grupo económico.";
  if (recortado.length > 200) return "El nombre no puede superar los 200 caracteres.";
  return null;
}
