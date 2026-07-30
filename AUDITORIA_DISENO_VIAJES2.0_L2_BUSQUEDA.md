# VIAJES 2.0 — LISTADO OPERATIVO
## Bloque L2: Búsqueda operativa — Auditoría y diseño

**Tipo:** Auditoría + propuesta técnica. Sin implementación, sin commits, sin push.

**Base:** continúa `AUDITORIA_VIAJES2.0_LISTADO.md` (Bloque "Listado operativo"), específicamente el hallazgo H-2 ("no existe ninguna búsqueda de texto libre") y la línea L5 de su roadmap. Este documento reemplaza/detalla esa línea con el análisis pedido explícitamente en este bloque.

**Alcance:** exclusivamente `Viajes.tsx`, `GET /viajes` (`findAll`, `viajes.controller.ts:84-124` tras el Bloque L1), las consultas Prisma involucradas, y los índices de `Viaje` que las sostienen. Nada de Liquidaciones/Facturas/Anticipos/Reportes/Dashboard.

---

## 1. Qué campos deberían poder buscarse

Evaluación de los 7 candidatos pedidos:

| Campo | Tipo de dato | ¿Incluir en v1? | Por qué |
|---|---|---|---|
| **CTG** | `String` escalar en `Viaje` (`ctg`) | **Sí** | Es el identificador que un operador tiene físicamente en la mano (documento de la carga). Es exactamente el caso de uso que motivó el hallazgo H-2 original. |
| **Carta de Porte** | `String` escalar en `Viaje` (`cartaPorte`) | **Sí** | Mismo argumento que CTG: identificador de documento físico, no un dato de catálogo. |
| **Número de Viaje** | `Int` escalar en `Viaje` (`numeroViaje`) | **Sí, pero con reglas distintas** (match exacto, no texto parcial — ver §2) | Útil cuando el operador ya conoce el número (p. ej. lo vio en el listado hace un rato y volvió a buscarlo), pero es menos frecuente como punto de partida que CTG/Carta de Porte. Barato de agregar una vez que el mecanismo de `OR` ya existe para los otros dos. |
| **Cliente** | Relación (`cliente.razonSocial`) | **No, en v1** | Ya existe un filtro dedicado (`<select>` Cliente, `Viajes.tsx:49-56`) que resuelve este caso de forma más precisa que un texto libre: elegir de una lista finita y sin ambigüedad, en vez de escribir un fragmento de razón social que puede coincidir parcialmente con más de una empresa. |
| **Transportista** | Relación (`transportista.razonSocial`) | **No, en v1** | Mismo argumento que Cliente. No tiene filtro dedicado todavía en la UI (aunque el backend ya lo soporta — hallazgo H-7/L3 de la auditoría anterior), pero la solución correcta para ese caso es exponer el filtro `transportistaId` ya existente (Bloque L3, no L2), no mezclarlo en la búsqueda de texto libre. |
| **Origen** | Relación (`origen.nombre`) | **No, en v1** | Mismo argumento: catálogo acotado de Ubicaciones, mejor resuelto con un filtro estructurado que con texto libre. No hay hoy ningún filtro por Origen/Destino ni en backend ni en frontend — quedaría como una posible línea de roadmap futura, separada de la búsqueda. |
| **Destino** | Relación (`destino.nombre`) | **No, en v1** | Mismo argumento que Origen. |

**Criterio general aplicado:** un cuadro de búsqueda de texto libre debe resolver "tengo un identificador de documento y quiero encontrar SU Viaje" (CTG, Carta de Porte, N°). Todo lo demás (Cliente, Transportista, Origen, Destino) es información de catálogo — un conjunto acotado y conocido de opciones — que se navega mejor con filtros estructurados (selects) que con texto libre. Mezclar ambos tipos en un mismo cuadro de búsqueda es, además, la fuente más probable de "búsquedas confusas" (ver §4): un operador que escribe "Acopio" sin saber si eso va a matchear un Cliente, una Ubicación, o ninguno de los dos.

---

## 2. Backend

**Extensión de `GET /viajes` (sin nuevo endpoint, un parámetro más en `findAll`):**

```ts
@Get()
async findAll(
  @Query("desde") desde?: string,
  @Query("hasta") hasta?: string,
  @Query("clienteId") clienteId?: string,
  @Query("transportistaId") transportistaId?: string,
  @Query("estado") estado?: string,
  @Query("cerealId") cerealId?: string,
  @Query("q") q?: string,               // <- nuevo
) {
  const where: any = { ...(filtros existentes, sin cambios) };

  if (q && q.trim()) {
    const texto = q.trim();
    const numeroViajeExacto = /^\d+$/.test(texto) ? Number(texto) : undefined;
    where.OR = [
      { ctg: { contains: texto, mode: "insensitive" } },
      { cartaPorte: { contains: texto, mode: "insensitive" } },
      ...(numeroViajeExacto !== undefined ? [{ numeroViaje: numeroViajeExacto }] : []),
    ];
  }

  return this.prisma.viaje.findMany({ where, select: selectViajeListado, orderBy: { fecha: "desc" } });
}
```

**Por qué esta forma y no otra:**
- `where.OR` como clave adicional en el mismo objeto `where` que ya tiene `fecha`/`clienteId`/`transportistaId`/`estado`/`cerealId`: Prisma combina con `AND` implícito todas las claves de nivel superior de un mismo `where`, así que el resultado es exactamente `(filtros existentes) AND (ctg contiene texto OR cartaPorte contiene texto OR numeroViaje = N)` — la búsqueda se combina con los filtros activos, no los reemplaza ni los ignora (ver también §3).
- `numeroViaje` es `Int`, no soporta `contains` (no es un campo de texto) — de ahí el chequeo `/^\d+$/` antes de agregarlo al `OR`, y por qué es **match exacto**, no texto parcial. Si el usuario escribe algo no numérico, esa condición simplemente no se agrega (no rompe, no genera error).
- No se crea ningún endpoint nuevo — es el mismo `GET /viajes` con un parámetro opcional más, mismo patrón que los cinco filtros que ya existen.
- **Compatibilidad hacia atrás total:** `q` es opcional; cualquier consumidor actual de `GET /viajes` que no lo envíe (incluida la propia `Viajes.tsx` de hoy, antes de tocarla) sigue recibiendo exactamente el mismo resultado que antes.

**Impacto sobre índices:**

| Condición del `OR` | Tipo de operación SQL | ¿Usa un índice existente? |
|---|---|---|
| `ctg: { contains }` | `ILIKE '%texto%'` | **No.** `@@unique([organizacionId, ctg])` es un índice de igualdad — un `LIKE`/`ILIKE` con comodín al inicio (`%texto%`) no puede usar un btree estándar. Se resuelve con un escaneo secuencial, acotado ya por `organizacionId` (siempre inyectado) y por los demás filtros activos. |
| `cartaPorte: { contains }` | `ILIKE '%texto%'` | **No.** `cartaPorte` no tiene ningún índice hoy (`schema.prisma`, modelo `Viaje`). Mismo caso que `ctg`, sin siquiera el índice único de por medio. |
| `numeroViaje: { equals }` | `= N` | **No.** No existe `@@index([numeroViaje])` (solo `id` es clave primaria; `numeroViaje` es un `Int` con `@default(autoincrement())`, sin índice propio). Una igualdad sobre un entero sin índice también es escaneo secuencial, aunque más barato que un `ILIKE`. |

**Rendimiento esperado:** al volumen de datos actual (confirmado en el Bloque L1: decenas de Viajes por organización en los entornos de prueba), un escaneo secuencial acotado por `organizacionId` es imperceptible. El riesgo crece con el volumen — exactamente el mismo tipo de riesgo ya documentado como H-4 en la auditoría del listado (falta de paginación), y **no independiente de él**: una búsqueda sin resultados acotados sigue devolviendo todo lo que matchea, sin límite. Ver §5.

**Alternativa considerada y descartada para v1:** usar `startsWith` en vez de `contains` sí podría aprovechar el índice único de `ctg` (un btree soporta búsquedas por prefijo), pero es una búsqueda mucho menos útil para el operador real, que puede recordar un fragmento del medio o el final del CTG, no necesariamente el principio. Se prioriza utilidad real sobre optimización prematura, dado que el volumen actual no lo justifica — queda documentado como trade-off consciente, no como omisión.

---

## 3. Frontend

**Ubicación:** un `<input>` de texto adicional dentro del mismo contenedor `.filters` de `Viajes.tsx:40-67`, junto a `Desde`/`Hasta`/`Cliente`/`Estado` — mismo patrón visual y de maquetación, sin componentes nuevos.

**Comportamiento — recomendación: reutilizar el botón "Filtrar" existente, sin debounce en v1.**

Razones:
- Los cuatro filtros actuales **ya no se auto-aplican** al cambiar — requieren el clic explícito en "Filtrar" (`Viajes.tsx:67`, `onClick={cargar}`). Agregar un campo de búsqueda que sí dispare la consulta automáticamente (con debounce) rompería la consistencia de comportamiento ya establecida en esta misma pantalla: dos controles con reglas de interacción distintas, uno inmediato y cuatro manuales, en la misma fila de filtros.
- Cero código nuevo de temporización (sin `setTimeout`/`useEffect` con debounce), cero riesgo de requests duplicadas o carreras entre tipeo y respuesta.
- Es la opción de menor esfuerzo y menor riesgo para una primera versión, coherente con el criterio de "implementación incremental" pedido en §6.

**Alternativa (no recomendada para v1, documentada para decisión explícita del Product Owner):** debounce automático (300-400ms sin necesidad del botón) — más "moderno", pero introduce la inconsistencia señalada arriba y una superficie de UI nueva no probada. Se deja como posible paso 2 del roadmap incremental (§6), a evaluar recién después de observar el uso real de la v1.

**Interacción con los filtros actuales:** la búsqueda se combina con `AND` respecto a `Desde`/`Hasta`/`Cliente`/`Estado`, igual que el backend ya combina `cerealId`/`transportistaId` entre sí (§2). Si el operador tiene `Cliente = "Acopio X"` seleccionado y busca `"CTG-001"`, solo verá Viajes que cumplan ambas condiciones a la vez. Es el comportamiento esperado y consistente con el resto del listado, pero se documenta explícitamente para que sea una decisión consciente del diseño, no un efecto secundario accidental.

---

## 4. UX

**Qué espera encontrar un operador:** típicamente parte de un documento físico (remito, carta de porte, papel con el CTG anotado) y quiere ubicar el Viaje correspondiente sin tener que recordar la fecha exacta ni el cliente — el caso de uso central que motiva esta búsqueda es justamente ese, y es el que justifica limitar el alcance a CTG/Carta de Porte/N° (§1).

**Cómo evitar búsquedas confusas:**
- **Placeholder explícito** en el campo (p. ej. `"Buscar por CTG, Carta de Porte o N° de viaje"`) — comunica de antemano qué SÍ cubre la búsqueda, para que el operador no espere encontrar resultados escribiendo el nombre de un cliente o una ubicación.
- **No mezclar catálogo (Cliente/Transportista/Origen/Destino) con documento (CTG/Carta de Porte/N°) en el mismo cuadro** — ya justificado en §1. Es la decisión de diseño más importante de este bloque para evitar resultados confusos: una búsqueda de texto libre que también matcheara nombres de cliente/ubicación devolvería, para un término ambiguo, una mezcla de coincidencias de naturaleza distinta sin ninguna forma de que el operador entienda por qué apareció cada resultado.
- **Riesgo residual documentado, no resuelto en v1:** un término numérico corto (p. ej. buscar el Viaje N° 7) puede matchear tanto por igualdad exacta de `numeroViaje` como por coincidencia parcial dentro de cualquier `ctg`/`cartaPorte` que contenga ese dígito en cualquier posición (p. ej. un CTG "CTG-2027-004"). Para v1 esto se acepta como ruido tolerable dado el volumen de datos actual; si en el futuro se vuelve un problema real, la mejora sería distinguir visualmente el resultado por coincidencia exacta de N° del resto (fuera de alcance de este diseño).

**Comportamiento cuando no hay resultados:** reutilizar el mensaje ya existente en `Viajes.tsx:100-102` (`"No hay viajes que coincidan con los filtros."`), que ya es genérico y cubre también el caso de búsqueda sin resultados sin necesidad de un mensaje especial nuevo. Mejora cosmética opcional, no crítica: ajustar el texto para mencionar explícitamente "la búsqueda" cuando `q` está activo, de forma que el operador entienda que el término buscado no tuvo coincidencias (en vez de asumir que es un problema de los filtros de fecha/cliente/estado).

---

## 5. Riesgos

| Riesgo | Descripción | Mitigación / decisión |
|---|---|---|
| **Rendimiento** | `contains` sobre `ctg`/`cartaPorte` sin índice trigram es un escaneo secuencial (acotado por organización) | Aceptable al volumen actual (confirmado en Bloque L1). Documentado como condición de revisión futura: si el volumen crece y se mide degradación real, evaluar `pg_trgm` + índice `gin` — no implementar preventivamente sin medición. |
| **Complejidad** | Baja — un parámetro opcional más, mismo patrón `AND` que los filtros existentes, sin nuevo endpoint ni cambio de contrato de respuesta | — |
| **Compatibilidad** | `q` es aditivo y opcional | Ningún consumidor existente de `GET /viajes` se ve afectado si no lo envía |
| **Escalabilidad** | La búsqueda **no resuelve** la falta de paginación (H-4/L7 de la auditoría anterior) — una búsqueda con muchos resultados sigue devolviendo todos sin límite | L2 y L7 son complementarios, no sustitutos; no se debe interpretar la implementación de L2 como que resuelve el riesgo de escalabilidad ya documentado |
| **Ruido en coincidencias numéricas cortas** | Ver §4 — un N° de Viaje corto puede aparecer también como substring de un CTG no relacionado | Aceptado como limitación conocida de v1, sin solución propuesta todavía |
| **Índice único de `ctg` no aprovechado** | El `@@unique([organizacionId, ctg])` existente no acelera `contains` (solo `startsWith`/igualdad) | Trade-off consciente, documentado en §2 (se prioriza utilidad de búsqueda sobre esta optimización) |

---

## 6. Roadmap incremental propuesto

| Paso | Contenido | Depende de |
|---|---|---|
| **Paso 1 (v1 — a implementar tras aprobación de este diseño)** | Backend: parámetro `q` en `GET /viajes` con `OR` sobre `ctg`/`cartaPorte` (`contains`, insensible a mayúsculas) + `numeroViaje` (igualdad exacta si el texto es numérico). Frontend: un `<input>` de texto en `.filters`, mismo botón "Filtrar" existente, sin debounce nuevo. | Bloque L1 (ya desplegado — este diseño asume el `select` reducido de L1, no el `include` anterior) |
| **Paso 2 (opcional, evaluar después de v1)** | Debounce automático (sin requerir clic en "Filtrar") — solo si el Product Owner lo pide tras observar el uso real de v1 | Paso 1 |
| **Paso 3 (condicional a volumen medido, no especulado)** | Índice trigram (`pg_trgm` + `gin`) sobre `ctg`/`cartaPorte` si se mide degradación real de rendimiento | Paso 1 + medición real |
| **Paso 4 (recordatorio, no parte de este bloque)** | L7 (paginación) del roadmap de `AUDITORIA_VIAJES2.0_LISTADO.md` sigue pendiente y se vuelve más relevante a medida que se agregan más formas de generar resultados grandes (búsqueda incluida) | Independiente, bloque propio |

---

**Fin del diseño del Bloque L2. Sin cambios de código. Sin commits. Sin push. Queda a la espera de aprobación antes de implementar el Paso 1.**
