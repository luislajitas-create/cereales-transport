# Versionado — SDC

Fecha: 2026-07-09. Propuesta práctica de versionado, adaptada al estado real del proyecto y a la metodología ya en uso (`METODOLOGIA_SDC.md`). No es una explicación teórica de Semantic Versioning — es cómo se debería numerar SDC de acá en adelante.

---

## Esquema

`0.1` → `0.2` → `0.3` → `0.4` → `0.5` → `1.0` → `1.1` → ...

Mientras el número mayor sea `0`, el sistema está en construcción activa hacia la primera versión de producción — es información útil para cualquiera que mire el número (nadie debería asumir que un `0.x` está listo para operar con dinero real de un cliente sin supervisión). El salto a `1.0` es, en sí mismo, la afirmación de que `CRITERIOS_LIBERACION.md` se cumplió.

## Dónde está SDC hoy, con este esquema

| Versión | Corresponde a |
|---|---|
| 0.1 | Versión inicial — los 7 módulos de negocio reincorporados y funcionando de punta a punta |
| 0.2 | Bloque 3 — integridad de datos, comisiones, liquidaciones |
| 0.3 | Bloque 4 — guardas de negocio, refacturación, cobranzas |
| 0.4 | Bloque 5.1 + 5.2 — seguridad de catálogos, integridad de catálogos |
| **0.5** | **Bloque 5.3.1 + 5.3.2 — UX financiera, planilla profesional. Es donde está el proyecto hoy.** |
| 1.0 | Cuando se cumplan los criterios de `CRITERIOS_LIBERACION.md` — ver `PLAN_VERSION_1_0.md` para lo que falta. |

## Cuándo corresponde subir cada número

SDC no es una librería con una API pública que terceros consuman — es un sistema interno de negocio. Por eso el criterio de "qué es un cambio que rompe algo" no es sobre un contrato de API, sino sobre **qué tan visible es el cambio para quien usa o depende del sistema todos los días**: un operador cargando viajes, un transportista esperando su liquidación, o el negocio decidiendo si confiar en los números que el sistema muestra.

### Patch (`0.4` → `0.4.1`, por ejemplo)

Un sub-bloque que corrige o refuerza algo sin cambiar cómo el usuario trabaja — el sistema se comporta mejor "por dentro", pero se ve y se usa igual que antes. Ejemplos ya ocurridos en el proyecto: cada entrega individual de seguridad (`258e8a4`), de integridad de catálogos (`8173bd5`, `ccf4673`), o cualquier corrección de un bug sin cambio de flujo.

**Regla práctica:** si para describir el cambio en el changelog hace falta explicar "esto ya no se puede hacer" o "esto ahora es más seguro", pero no "esto ahora se ve/se usa distinto", es patch.

### Minor (`0.4` → `0.5`)

El cierre de un **bloque completo** (no de un sub-bloque individual) que sí cambia visiblemente cómo se usa una parte del sistema, o habilita algo que antes no se podía hacer desde la interfaz. Es el nivel que este proyecto ya usa de hecho para cada uno de los saltos de la tabla de arriba — cada bloque cerrado sube un minor, independientemente de cuántos sub-bloques/commits tuvo adentro.

**Regla práctica:** si el changelog de ese cierre tiene bullets que un usuario de negocio (no técnico) notaría al usar el sistema, es minor.

### Major (`0.x` → `1.0`, y de ahí en adelante `1.x` → `2.0`)

Reservado para dos casos, no para "una mejora grande" en general:

1. **El primer salto (`0.x` → `1.0`)** — cuando se cumplen los criterios de `CRITERIOS_LIBERACION.md`. No es sobre el tamaño del último bloque cerrado, es sobre si el sistema completo (no solo el módulo que se tocó último) está listo para operar sin la supervisión manual que hoy compensa la deuda técnica pendiente.
2. **Después de 1.0**, un cambio que redefine el alcance del sistema o rompe cómo ya se venía trabajando con datos existentes — el ejemplo concreto ya identificado en este proyecto es una eventual integración con AFIP/facturación fiscal real (pregunta N4, todavía sin responder): si se decide que sí, cambia qué es realmente el módulo de Facturación, no es una mejora incremental sobre lo que ya existe.

**Regla práctica:** si hace falta volver a explicarle a un usuario que ya conoce el sistema cómo funciona una parte que antes daba por sabida, es candidato a major — no antes.

## Qué no determina la versión

- **La cantidad de commits o de líneas de código** — un patch puede tocar más archivos que un minor si el cambio, aunque grande, es invisible para el usuario.
- **El esfuerzo de implementación** — un refactor de arquitectura de fondo (capa de servicio, por ejemplo) puede ser mucho trabajo y seguir siendo un patch si no cambia nada de cara al usuario.
- **Cuánto tiempo pasó desde la última versión** — no hay cadencia fija ni obligación de versionar por calendario; se versiona cuando un bloque o sub-bloque cierra, no antes.
