// Validación de CUIT/CUIL argentino — algoritmo estándar de dígito verificador (módulo 11).
// Función pura, sin dependencias — reutilizable tanto desde el decorator de class-validator
// como desde un test unitario directo.
const MULTIPLICADORES = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function esCuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit)) return false;

  const digitos = cuit.split("").map(Number);
  const suma = MULTIPLICADORES.reduce((acc, mult, i) => acc + mult * digitos[i], 0);
  const resto = suma % 11;
  let verificador = 11 - resto;
  if (verificador === 11) verificador = 0;
  if (verificador === 10) return false; // el algoritmo estándar no produce un CUIT válido en este caso

  return verificador === digitos[10];
}
