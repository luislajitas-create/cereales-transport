# Enmienda al Diseño V2 (H-02) — Protección de `constructor`

Fecha: 2026-07-25. Enmienda puntual de `DISEÑO_CORRECCION_H02_BLOQUE11_V2.md`, basada en `REVISION_TECNICA_CONSTRUCTOR_PROTOTYPE_H02.md` (Estrategia C) y `VALIDACION_ARQUITECTURA_CONSTRUCTOR_OBJECT.md` (Resultado A). No reemplaza el Diseño V2; lo complementa exclusivamente en los puntos afectados por la defensa de `"constructor"`. No modifica ningún documento existente. No implementa código.

---

## 1. Resumen ejecutivo

El Diseño V2 de H-02 no incluía una defensa explícita para la clave `"constructor"`, asumiendo que `.bind(target)` era suficiente para impedir el acceso a `.prototype` de la clase real. Esa suposición resultó incorrecta contra la clase real de producción (`PrismaService extends PrismaClient`): la función ligada resultante, aunque sin `.prototype` propio, hereda por `[[Prototype]]` el `.prototype` real de `PrismaClient`, exponiendo los 4 métodos raw sin protección. La corrección validada consiste en interceptar explícitamente la clave `"constructor"` en el trap `get` ya existente y devolver siempre el constructor global `Object`, cerrando el vector sin construir ningún objeto nuevo y sin afectar ningún otro componente del mecanismo. Esta enmienda actualiza únicamente las secciones del Diseño V2 afectadas por esta decisión; todo el resto permanece vigente sin cambios.

---

## 2. Cambios respecto del Diseño V2

| Punto | Diseño V2 (original) | Enmienda |
|---|---|---|
| Defensa de `"constructor"` | Ninguna explícita — se asumía cubierta por `.bind(target)` | Rama explícita nueva en el trap `get`, retorno fijo `Object` |
| Riesgo de `constructor.prototype` | Clasificado como bajo / dependiente de no remover el `.bind()` | Reclasificado como confirmado y explotable contra la clase real (`PrismaService`) |
| Objeto nuevo a construir | No aplica | Ninguno — `Object` es un valor global existente |
| Archivo afectado | `organizacion-prisma.client.ts` | Mismo archivo, sin cambios de alcance |

---

## 3. Nuevo comportamiento de `"constructor"`

- `cliente.constructor === Object` (identidad estable, siempre la misma referencia global).
- `cliente.constructor.prototype === Object.prototype`.
- `Object.getPrototypeOf(cliente.constructor) === Function.prototype`.
- `Reflect.getPrototypeOf(cliente.constructor) === Function.prototype`.
- `cliente.constructor.constructor === Function` — fuera de alcance de H-02 (inherente al lenguaje, no específico de este mecanismo).
- `cliente instanceof cliente.constructor === true` — coherente con el trap `getPrototypeOf` ya vigente (`Object.prototype`).
- Ningún camino desde `cliente.constructor` alcanza `PrismaService`, `PrismaClient`, `PrismaClient.prototype` ni ninguno de los 4 métodos raw.

---

## 4. Actualización del orden del trap `get`

Orden de evaluación dentro del trap `get` (única función afectada):

1. Métodos raw bloqueados (`METODOS_RAW_BLOQUEADOS`) — sin cambios, ya vigente.
2. `"__proto__"` — sin cambios, ya vigente.
3. **`"constructor"` — nuevo. Retorno fijo (`Object`), sin leer `target["constructor"]`.**
4. Lectura genérica (`target[prop]`) — sin cambios, para cualquier otra clave.
5. `.bind(target)` si el valor es función — sin cambios; ya no se aplica a `"constructor"`, resuelto en el paso 3.

---

## 5. Actualización de la matriz de amenazas

| Vector | Estado en Diseño V2 | Estado tras la enmienda |
|---|---|---|
| `cliente.constructor` | Riesgo bajo (mitigado supuestamente por `.bind()`) | Cerrado — retorno fijo `Object` |
| `cliente.constructor.prototype` | Riesgo bajo | Cerrado |
| `cliente.constructor.prototype.$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` | No contemplado explícitamente | Cerrado, consecuencia directa del cierre anterior |
| `Object.getPrototypeOf(cliente.constructor)` | No contemplado | Cerrado, consecuencia directa |
| `Reflect.getPrototypeOf(cliente.constructor)` | No contemplado | Cerrado, consecuencia directa |
| `cliente.constructor.__proto__` | No contemplado | Cerrado, consecuencia directa |
| `Reflect.get(cliente, "constructor")` | No contemplado | Cerrado — mismo trap `get` |
| `cliente.constructor.constructor` (`Function`) | No contemplado | Fuera de alcance de H-02, documentado explícitamente |

Todas las demás filas de la matriz de amenazas del Diseño V2 (`__proto__=`, `Receiver`, `getPrototypeOf`/`setPrototypeOf` del cliente, `TransactionClient`) permanecen sin cambios.

---

## 6. Actualización de los tests

Se agregan a la batería ya prevista en el Diseño V2 (reemplazando el único test genérico de `constructor.prototype` que ese diseño contemplaba, insuficiente porque no distinguía `PrismaService` real de un mock):

| # | Test | Requiere `PrismaService` real |
|---|---|---|
| 1 | `cliente.constructor === Object` | Sí |
| 2 | `cliente.constructor !== PrismaService` | Sí |
| 3 | `cliente.constructor !== PrismaClient` | Sí |
| 4 | `cliente.constructor.prototype === Object.prototype` | Sí |
| 5-8 | `cliente.constructor.prototype.$queryRaw`/`$executeRaw`/`$queryRawUnsafe`/`$executeRawUnsafe` son `undefined` | Sí |
| 9 | `Reflect.get(cliente, "constructor") === Object` | No (puede usar mock) |
| 10 | `Object.getPrototypeOf(cliente.constructor) === Function.prototype` | No (puede usar mock) |
| 11 | `cliente.constructor.__proto__ === Function.prototype` | No (puede usar mock) |
| 12 | Métodos Prisma legítimos siguen funcionando (regresión) | Sí |
| 13 | Resultado idéntico en Jest y Node compilado, usando `PrismaService` en ambos | Sí, en ambos entornos |

Los tests de `$transaction` (array y callback) ya previstos en el Diseño V2 permanecen sin cambios, sin relación con este vector.

---

## 7. Actualización de criterios de aceptación

Se agregan a los ya vigentes en el Diseño V2:

- `cliente.constructor === Object`, verificado contra `PrismaService` real.
- `cliente.constructor.prototype === Object.prototype`, verificado contra `PrismaService` real.
- Ninguno de los 4 métodos raw alcanzable vía `cliente.constructor.prototype` ni ninguna variante derivada.
- `Reflect.get(cliente, "constructor")` protegido de forma idéntica a `cliente.constructor`.
- Identidad estable de `cliente.constructor` entre lecturas sucesivas.
- Resultado idéntico entre Jest y Node compilado, usando `PrismaService` real en ambos entornos.

---

## 8. Actualización de criterios de detención

Se agregan a los ya vigentes en el Diseño V2:

- `cliente.constructor` sigue exponiendo `PrismaService` o `PrismaClient`.
- `cliente.constructor.prototype` (o cualquier variante derivada) sigue exponiendo cualquiera de los 4 métodos raw.
- La defensa depende únicamente de `.bind(target)`, sin la rama explícita para `"constructor"`.
- `PrismaClient` directo pasa las pruebas pero `PrismaService` real falla.
- Jest y Node compilado difieren en el resultado, usando la misma clase (`PrismaService`) en ambos.
- Se requiere modificar algún archivo productivo además de `organizacion-prisma.client.ts`.

---

## 9. Confirmación de vigencia del resto del Diseño V2

Permanecen exactamente como fueron diseñados y validados, sin ningún cambio introducido por esta enmienda:

- La estrategia del trap `set` para `"__proto__"`.
- El comportamiento de `Receiver` / `Reflect.set(target, prop, value, receiver)`.
- El trap `getPrototypeOf` (retorno `Object.prototype`).
- El trap `setPrototypeOf` (lanza excepción).
- El tratamiento de `TransactionClient` (`tx`), sin envoltura.
- El alcance de archivos (`organizacion-prisma.client.ts` y su spec, únicamente).
- El plan de implementación general y el orden de pasos no relacionados con `"constructor"`.
- H-07, explícitamente fuera de alcance de H-02 en toda esta cadena.

---

## Preimplementación — qué deberá cambiar

- Agregar un caso explícito para la clave `"constructor"` dentro del trap `get` ya existente, evaluado antes de la lectura genérica.
- Ese caso debe devolver siempre el constructor global `Object`, sin leer `target["constructor"]` en ningún momento.
- Mantener el resto de los traps (`get` para los métodos raw y `"__proto__"`, `set`, `getPrototypeOf`, `setPrototypeOf`) exactamente sin cambios respecto de lo ya aprobado en el Diseño V2.

No se escribe código en este documento.

---

## Conclusión

**ENMIENDA APROBADA**

---

## Informe final

- **Documento generado:** `ENMIENDA_DISENO_H02_V2_CONSTRUCTOR.md` (este documento). Ningún otro documento fue modificado.
- **Alcance:** exclusivamente los puntos afectados por la defensa de `"constructor"` (estrategia del trap `get`, orden de evaluación, modelo de amenazas, matriz de validación, tests, criterios de aceptación, criterios de detención). El resto del Diseño V2 permanece vigente sin cambios (sección 9).
- **Implementación:** no ejecutada en esta etapa.
- **Conclusión:** ENMIENDA APROBADA.
- **Próxima etapa:** pendiente de autorización explícita del usuario; no se inicia en este documento.
