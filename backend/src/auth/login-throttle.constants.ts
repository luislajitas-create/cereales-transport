// Extraído a un archivo propio para romper un import circular entre auth.module.ts (que
// definía estas constantes y también importa AuthController para registrarlo) y
// auth.controller.ts (que importaba estas constantes de auth.module.ts). Mismo patrón, mismo
// hallazgo, que ya se corrigió para el endpoint de alta de organización (ver
// organizaciones-publicas.controller.ts) — se generaliza acá.
//
// Efecto real del ciclo: @Throttle() recibía `undefined` en el momento exacto de evaluar el
// decorator (auth.controller.ts se cargaba antes de que auth.module.ts terminara de definir
// estas constantes), y la librería caía en silencio al perfil base registrado por
// ThrottlerModule.forRoot() en auth.module.ts. Quedó enmascarado hasta ahora porque el override
// de login (10 intentos / 60s) es idéntico al perfil base — el comportamiento observable nunca
// cambió, pero el override en sí nunca estuvo realmente aplicándose.
export const LOGIN_THROTTLE_TTL_MS = 60_000;
export const LOGIN_THROTTLE_LIMITE = 10;
