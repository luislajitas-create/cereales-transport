// Validación centralizada de variables de entorno críticas — se ejecuta una sola vez, al
// arrancar, antes de que cualquier módulo (en particular AuthModule) llegue a leerlas.
// Bloque 8.1.a: elimina el fallback inseguro de JWT_SECRET ("dev-secret-change-me") y el
// fallback silencioso de CORS_ORIGIN ("*") — ninguno de los dos vuelve a usarse en el código,
// ni acá ni en ningún otro archivo.

const JWT_SECRET_INSEGUROS_CONOCIDOS = new Set([
  "dev-secret-change-me",
  "cambiar-este-secreto-en-produccion",
]);

const JWT_SECRET_LONGITUD_MINIMA = 16;

function fallarArranque(mensaje: string): never {
  console.error(`\n[ARRANQUE ABORTADO] ${mensaje}\n`);
  process.exit(1);
}

export function validarEntorno(): void {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim().length === 0) {
    fallarArranque(
      "JWT_SECRET no está definida. Configurá esta variable de entorno con un secreto propio antes de arrancar — ya no existe ningún valor por defecto.",
    );
  }
  if (JWT_SECRET_INSEGUROS_CONOCIDOS.has(jwtSecret)) {
    fallarArranque(
      "JWT_SECRET tiene un valor de desarrollo ya conocido e inseguro (el mismo que antes se usaba como fallback en el código, hoy visible en el historial del repositorio). Configurá un secreto propio — nunca reutilices ese valor.",
    );
  }
  if (jwtSecret.length < JWT_SECRET_LONGITUD_MINIMA) {
    fallarArranque(
      `JWT_SECRET es demasiado corta (mínimo ${JWT_SECRET_LONGITUD_MINIMA} caracteres) para considerarse segura.`,
    );
  }

  const corsOrigin = process.env.CORS_ORIGIN;
  if (!corsOrigin || corsOrigin.trim().length === 0) {
    fallarArranque(
      "CORS_ORIGIN no está definida. Configurá el origen del frontend autorizado antes de arrancar — ya no existe ningún valor por defecto (antes era \"*\").",
    );
  }
}
