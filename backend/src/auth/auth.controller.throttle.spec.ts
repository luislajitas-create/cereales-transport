import "reflect-metadata";
import { AuthController } from "./auth.controller";
import { LOGIN_THROTTLE_LIMITE, LOGIN_THROTTLE_TTL_MS } from "./login-throttle.constants";

// Prueba dirigida al hallazgo de import circular (auth.module.ts <-> auth.controller.ts):
// antes de la corrección, @Throttle() evaluaba LOGIN_THROTTLE_LIMITE/TTL_MS como `undefined`
// (el ciclo hacía que auth.controller.ts se cargara antes de que auth.module.ts terminara de
// definirlas), y la metadata quedaba escrita con `undefined` en vez del valor real — sin que
// esto cambiara el comportamiento observable, porque el fallback al perfil base coincide en
// valor. Esta prueba inspecciona la metadata directamente (no el comportamiento HTTP, que es
// indistinguible en ambos casos) para demostrar que el override en sí ahora sí se aplica.
describe("AuthController — metadata de throttling de login", () => {
  it("@Throttle() en login() tiene el límite y ttl reales, no undefined", () => {
    const metodo = AuthController.prototype.login;
    const limite = Reflect.getMetadata("THROTTLER:LIMITdefault", metodo);
    const ttl = Reflect.getMetadata("THROTTLER:TTLdefault", metodo);

    expect(limite).toBe(LOGIN_THROTTLE_LIMITE);
    expect(ttl).toBe(LOGIN_THROTTLE_TTL_MS);
    expect(limite).not.toBeUndefined();
    expect(ttl).not.toBeUndefined();
  });
});
