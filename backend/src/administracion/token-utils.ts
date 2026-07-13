import { randomBytes, createHash } from "node:crypto";

// Bloque 9.1/9.3 — generación y verificación de tokens de un solo uso (activación de cuenta,
// recuperación de contraseña). Funciones puras, sin Prisma ni DI: el token en sí nunca se
// persiste, solo su hash (mismo principio que Usuario.passwordHash) — SHA-256 alcanza acá
// porque el token ya es aleatorio de alta entropía, a diferencia de una contraseña elegida
// por una persona, que sí necesita bcrypt.

export function generarTokenSeguro(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashearToken(token) };
}

export function hashearToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
