# Diseño Técnico — Bloque 10.4: Frontend de Grupo Económico

Fecha: 2026-07-16. Diseño técnico — **no se escribió código, no se modificó ningún archivo de frontend ni de backend, no se generaron migraciones, no se hizo commit ni push.** Se apoya en `AUDITORIA_BLOQUE10.4_FRONTEND.md` (aprobada como base) y respeta, sin reabrirlas, las decisiones ya aprobadas de Bloques 10.1, 10.2, 10.3.a y 10.3.b. No se auto-aprueba — queda a la espera de aprobación explícita (`METODOLOGIA_SDC.md`, etapa 3).

**La pregunta que responde este documento:** ¿cómo se construye el frontend mínimo para que un usuario autorizado sepa dónde está, sepa a dónde puede cambiar, cambie de forma segura, sin residuos, sincronizado entre pestañas — y qué administre visualmente de lo que el backend de Grupo Económico ya expone — sin modificar ni una línea del backend ya cerrado, salvo la única extensión mínima que la propia auditoría ya identificó como necesaria?

---

## 1. Alcance exacto

**Forma parte de 10.4:**
- Selector de Organización activa (en `Layout.tsx`).
- Carga de Organizaciones accesibles (requiere resolver la sección 2).
- Llamada a `POST /auth/cambiar-organizacion` (ya desplegado, 10.3.b).
- Reemplazo de `accessToken` y `usuario` en `localStorage`, en un orden seguro.
- Recarga completa (reutilizando el mecanismo ya existente en `api/client.ts`).
- Sincronización entre pestañas mediante el evento `storage`.
- Visualización clara de la Organización activa en `Layout.tsx`.
- Administración visual de accesos ya implementados en 10.3.a (otorgar/listar/revocar).
- Administración básica del Grupo Económico — **solo la parte de consulta**, ya respaldada por `GET /grupo-economico` (10.1); crear/asociar/desasociar quedan fuera (sección 10).

**Queda fuera:**
- Backend de Pago Consolidado (10.5/10.6).
- Identidad compartida de Chofer (10.2) — sección 11, con recomendación explícita de excluirla.
- Transportistas/Vehículos compartidos.
- RBAC dinámico.
- Suspensión de Organizaciones (`Organizacion.activo` no existe, sigue sin existir).
- Revocación instantánea de tokens.
- Cualquier librería nueva de estado o caché.
- Rediseño de `Layout.tsx` más allá de agregar el bloque del selector.
- `crear`/`asociar`/`desasociar` Grupo Económico como acciones de autoservicio (sección 10).

---

## 2. Endpoint de Organizaciones accesibles — el hallazgo central de la auditoría

### El problema, verificado de nuevo contra el código real

`GET /grupo-economico/:id/accesos` (`acceso-grupo.controller.ts`, releído fresco) devuelve `{ id, usuarioId, otorgadoPorId, createdAt }[]` — los accesos que **mi organización otorgó a otros**, filtrados por `organizacionId: actor.organizacionId`, y exige `ADMINISTRADOR`. No sirve para el selector, por dos razones verificadas, no una: (a) es el sentido inverso (a quién dejé entrar yo, no a dónde puedo entrar yo), y (b) exige `ADMINISTRADOR` — un usuario con `AccesoGrupoEconomico` pero sin ese rol (posible, porque la Decisión Técnica 1 de Bloque 10.3 hizo el acceso independiente del rol) no podría ni siquiera intentar consultarlo. `GET /grupo-economico` (10.1, `miGrupo()`) también exige `ADMINISTRADOR` — confirmado releyendo `grupo-economico.controller.ts` fresco. **Ningún endpoint hoy es accesible para un usuario autenticado no-`ADMINISTRADOR`**, incluido uno con acceso de grupo legítimo.

### Alternativas

**A. Agregar un endpoint mínimo de backend: `GET /grupo-economico/organizaciones-accesibles`**

Devuelve, para el usuario autenticado (`actor.id`/`actor.organizacionId`, nunca de un parámetro), la lista de organizaciones a las que puede cambiar: su propia organización + cada organización con `AccesoGrupoEconomico` vigente **y** que siga perteneciendo al mismo `GrupoEconomico` que la organización de origen en este momento (misma revalidación que ya hace `AuthService.cambiarOrganizacion()` — para que el selector nunca ofrezca una opción que, al clickearla, falle con `403`).

**B. Reconstruir la lista en frontend combinando endpoints existentes**

**No es una alternativa viable, no solo una peor — es imposible con los contratos actuales.** Verificado: no existe ningún endpoint, para ningún rol, que un usuario no-`ADMINISTRADOR` pueda consultar para saber sus propios accesos. Ni siquiera combinando todo lo que hoy expone `grupo-economico/` se puede reconstruir esa lista desde el frontend.

**C. Otra alternativa compatible con los contratos actuales**

Evaluada y descartada: extender la respuesta de `login()`/`cambiar-organizacion()` para incluir esta lista — **explícitamente prohibido por una decisión ya aprobada** (`DECISIONES_TECNICAS_BLOQUE10.3b.md`, Decisión 3: "no se agrega `organizacionesAccesibles`... cualquier dato adicional... se resuelve con endpoints separados y específicos"). No se identificó ninguna otra alternativa real.

### Análisis de la Alternativa A

- **Seguridad:** exige `JwtAuthGuard` únicamente (no `RolesGuard` — cualquier usuario autenticado, coherente con la intención original de `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 5, primera fila de la tabla: "Cualquier usuario autenticado"). Nunca acepta un `usuarioId` ni `organizacionId` del cliente — siempre `actor.id`/`actor.organizacionId` del JWT.
- **Aislamiento:** la consulta parte siempre de la identidad ya autenticada — no hay forma de pedir la lista de otro usuario.
- **Cantidad de requests:** uno, al montar `Layout` (o de forma diferida, la primera vez que se necesita).
- **Consistencia:** misma forma de autorización que el resto de los endpoints de `grupo-economico/`.
- **Necesidad de Prisma crudo:** **ninguna.** `AccesoGrupoEconomico` y `Organizacion` no son modelos organizacionales (confirmado, fuera de `ORGANIZACIONAL_MODELS`) — el cliente scopeado (`ORGANIZACION_PRISMA`), ya inyectado en cualquier controller de `grupo-economico/`, los consulta sin filtrado automático y sin necesitar `UsuarioGrupoLookupService`. No se amplía el allow-list de `PrismaService` crudo.
- **Responsabilidad del backend:** mínima — un método de lectura, sin escritura, sin `AuditLog` (una consulta no es un evento a auditar).
- **Riesgo de filtrar Organizaciones:** ninguno detectado — la respuesta se arma exclusivamente a partir de filas que ya pertenecen, por construcción de la consulta, al usuario autenticado.
- **Compatibilidad con 10.3.a/10.3.b:** total — no toca ningún archivo de ninguno de los dos, es un método nuevo en un controller ya existente (`AccesoGrupoController`, o uno nuevo — detalle de implementación).

### Recomendación

**Alternativa A.** Es una extensión mínima y estrictamente necesaria de 10.4 — **no una reapertura de 10.3.b:** no modifica `cambiarOrganizacion()`, no modifica el JWT, no modifica ninguna decisión ya tomada; es una lectura nueva, aditiva, sobre datos que ya existen. Requiere tu aprobación explícita porque sí toca el backend — se marca como Decisión Técnica pendiente (sección 16).

### Contrato mínimo

```
GET /grupo-economico/organizaciones-accesibles
→ [{ id: string, nombre: string, esActual: boolean }]
```

Sin CUIT, sin razón social, sin domicilio, sin ningún otro dato institucional — exactamente lo que el selector necesita para mostrar una lista y saber cuál está activa, nada más.

---

## 3. `AuthContext`

### Forma de `Usuario` (corrige el desajuste ya señalado en tres auditorías)

```
interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  organizacionId: string;
}
```

El dato ya llega hoy en tiempo de ejecución (`login()` y `cambiarOrganizacion()` ya lo incluyen, verificado en `auth.service.ts`) — esto es, únicamente, declarar correctamente lo que ya existe.

### Qué cambia y qué no

- **Carga inicial:** sin cambios — sigue leyendo `localStorage.getItem("usuario")` al montar.
- **Estado del token:** sin cambios — sigue viviendo únicamente en `localStorage`, nunca en el estado de React.
- **Estado del usuario:** mismo mecanismo, con el tipo corregido.
- **`loading`:** sin cambios — sigue siendo, únicamente, el de la carga inicial del contexto.
- **`error`:** **no se agrega al contexto.** Cada componente que invoque `cambiarOrganizacion()` maneja su propio error, con el mismo patrón ya establecido (`useAsyncAction`, usado en `Organizacion.tsx`/`Perfil.tsx`) — evita agregar estado global que solo le importa a un componente puntual (instrucción explícita: "no agregar estado global innecesario").
- **`logout()`:** sin cambios.
- **Persistencia:** sin cambios — las mismas dos claves de siempre. La lista de organizaciones accesibles **no se persiste** — se vuelve a pedir cada vez que hace falta (no es un dato de sesión, es una consulta).

### Función nueva: `cambiarOrganizacion(organizacionId: string): Promise<void>`

Vive en `AuthContext`, junto a `login()`/`logout()`, porque igual que esas dos, termina reescribiendo la sesión completa. Responsabilidad completa: llamar al endpoint, escribir `localStorage` en el orden seguro (sección 5), y disparar la recarga. **No actualiza el estado de React antes de recargar** — sería trabajo descartado, la recarga reconstruye todo desde cero de cualquier forma.

### Dónde vive la lista de Organizaciones accesibles

**No en `AuthContext`.** Es un dato que únicamente le importa al selector — vive en un hook chico y propio (por ejemplo `useOrganizacionesAccesibles()`), usado solo dentro del componente del selector en `Layout.tsx`. Mantiene `AuthContext` acotado a identidad y sesión, no a datos de una pantalla puntual.

---

## 4. Selector de Organización

**Ubicación:** el bloque `.user-info` de `Layout.tsx` (líneas 43-48 del código actual) — mismo lugar ya identificado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 11, y confirmado disponible en la auditoría de este bloque (pregunta 14).

- **Nombre de la Organización activa:** se muestra **siempre**, para cualquier usuario, incluso sin ningún acceso múltiple — usando la entrada `esActual: true` de la misma lista de la sección 2. Es la recomendación ya hecha en el diseño previo ("de forma permanente, no solo como un aviso puntual") y ahora se fija como parte de este diseño.
- **El selector en sí (para elegir otra Organización) se muestra únicamente si la lista tiene más de un elemento.** Con un solo elemento, se ve el nombre de la organización, sin ningún control interactivo adicional — mismo comportamiento ya anticipado en diseños previos.
- **Estado de carga:** mientras se resuelve la lista, no se muestra ningún selector todavía (ni un spinner disruptivo) — es una consulta rápida, de bajo costo, que no amerita un estado de carga visible separado.
- **Error al cargar la lista:** falla en silencio para el usuario — no se muestra el selector, el resto de `Layout` se renderiza con normalidad. Un fallo de esta consulta nunca debe bloquear la navegación.
- **Prevención de doble click:** el trigger del selector se deshabilita mientras hay un cambio en curso (mismo patrón `busy` que ya usa `useAsyncAction` en el resto del proyecto).
- **Confirmación antes del cambio:** reutiliza `useConfirm()` (`ConfirmDialog.tsx`, ya montado globalmente vía `ConfirmProvider` en `App.tsx`) — severidad `"medium"`, mensaje con el nombre de la organización destino.
- **Feedback posterior:** ninguno adicional — la propia recarga completa, mostrando la barra lateral ya actualizada con el nombre de la nueva organización, cumple ese rol (mismo razonamiento ya usado en el diseño previo).

---

## 5. Cambio de Organización — flujo exacto

1. El usuario elige la organización destino en el selector.
2. `useConfirm()` — si cancela, no pasa nada más.
3. Si confirma: `authContext.cambiarOrganizacion(organizacionId)` → `POST /auth/cambiar-organizacion`.
4. Recibe `{ accessToken, usuario }`.
5. **Orden de escritura en `localStorage`:**
   - Antes de escribir nada, se capturan los valores **actuales** de `"token"` y `"usuario"` (para poder revertir si algo falla).
   - Se escribe `"usuario"` primero, `"token"` al final. El listener de la sección 7 observa específicamente la clave `"token"` — escribirla al final la convierte en la señal de "el cambio ya está completo" para cualquier pestaña pasiva, que nunca debería reaccionar a un estado a medio escribir.
   - Si cualquiera de las dos escrituras lanza una excepción (caso extremo, ej. `QuotaExceededError`): se restauran de inmediato los valores originales capturados en ambas claves, **no se recarga la página**, y el error se propaga al componente que llamó a `cambiarOrganizacion()` para que lo muestre con el patrón ya establecido.
6. **No se actualiza el estado de React** antes de recargar — no tiene ningún efecto útil.
7. Se fuerza una recarga completa navegando a `/` (mismo destino que ya usa `Login.tsx` tras un login exitoso) — no se preserva la ruta actual, porque su contenido podría no tener sentido en la organización nueva (por ejemplo, el detalle de un Viaje que no existe ahí).
8. La aplicación arranca desde cero (`main.tsx`), `AuthProvider` relee `localStorage` — mismo mecanismo ya confirmado en la auditoría (pregunta 12).

---

## 6. Datos no guardados

### Alternativas

- **A. Confirmación explícita antes de cambiar, siempre.** Ya ocurre (sección 4/5), pero no resuelve el problema por sí sola: confirma la *intención* de cambiar, no le avisa a la persona sobre datos sin guardar en otra parte de la pantalla que ya tenía abierta.
- **B. Detectar formularios sucios mediante un mecanismo compartido.** Exigiría que cada formulario existente se registre contra ese mecanismo — instrucción explícita: "no exigir refactorizar todas las pantallas". Se descarta para esta primera versión.
- **C. Agregar `beforeunload` solo a pantallas críticas.** Un hook mínimo y compartido (ej. `useUnsavedChangesGuard(hayCambiosSinGuardar: boolean)`), adoptado **únicamente** por `ViajeForm.tsx` en esta primera versión — el único riesgo real ya identificado en la auditoría (pregunta 16). Cualquier otra pantalla puede adoptarlo después, sin que eso sea un requisito para cerrar 10.4.
- **D. Otra alternativa:** un `beforeunload` global e incondicional (sin importar si hay cambios reales) fue considerado y descartado — dispararía en cualquier recarga, no solo las relevantes, una mala práctica ya desaconsejada por el propio comportamiento estándar del navegador.

### Por qué `beforeunload` resuelve, sin diseño adicional, la distinción pedida

El evento `beforeunload` se dispara ante **cualquier** intento de descargar la página, sin importar si lo originó la propia pestaña (sección 5, paso 7) o una recarga disparada por el listener de `storage` (sección 7) por un cambio hecho en **otra** pestaña. No hace falta código separado para cada caso — es, estructuralmente, el mismo evento en ambos.

### Recomendación

**Alternativa C**, con `ViajeForm.tsx` como único adoptante de esta primera versión. Cumple las cuatro condiciones pedidas: evita pérdida silenciosa (en la pantalla de mayor riesgo ya identificada); no exige refactorizar todo; es compatible con la recarga completa (es, literalmente, el evento que la precede); y funciona igual sin importar qué pestaña originó el cambio.

---

## 7. Múltiples pestañas — listener del evento `storage`

- **Clave que observa:** `"token"` — nunca `"usuario"` (sección 5: es la última en escribirse, la señal confiable de que el cambio ya terminó).
- **Condición que dispara la recarga:** `event.key === "token" && event.newValue !== event.oldValue`. El propio navegador ya garantiza que este evento **nunca** se dispara en la pestaña que hizo el cambio — solo en las demás.
- **Cómo se evita un bucle:** la acción del listener es recargar la página, no volver a escribir en `localStorage` — no hay ninguna escritura que pueda re-disparar el propio evento. La recarga, además, destruye el listener junto con todo lo demás.
- **Si `token` y `usuario` cambian en eventos separados:** disparan dos eventos `storage` distintos en las pestañas pasivas; el listener, al estar acotado a la clave `"token"`, ignora el de `"usuario"` — sin doble recarga.
- **Si dos pestañas cambian casi simultáneamente:** no hace falta ninguna coordinación nueva — `localStorage` es un único almacén compartido, la última escritura gana, y **todas** las pestañas (la que originó cada cambio, y cualquier pasiva) terminan leyendo, en su propia recarga, el mismo valor final. Cumple exactamente el principio pedido: todas convergen a la organización representada por el último `accessToken` persistido.
- **Formulario sin guardar en una pestaña pasiva:** la recarga que el listener dispara en esa pestaña también atraviesa `beforeunload` si esa pestaña tiene `ViajeForm.tsx` abierto con el hook de la sección 6 activo — la persona ve el aviso nativo del navegador y puede optar por quedarse. Si elige quedarse, esa pestaña en particular sigue con el token anterior hasta que la persona actúe — una inconsistencia temporal aceptada, nunca una pérdida de datos.
- **Cómo se informa al usuario:** el propio diálogo nativo del navegador (los navegadores no permiten mensajes personalizados en `beforeunload`, por razones de seguridad ya estandarizadas) — no hay nada adicional que diseñar ahí.

**No se usa `BroadcastChannel`** — confirmado, coherente con la Decisión Técnica 6 ya ratificada.

---

## 8. Axios

**Verificado contra el código real (`api/client.ts`, releído fresco):** el interceptor de request ya lee `localStorage.getItem("token")` **en cada request**, sin cachear — no hace falta actualizar ningún default de la instancia de Axios ni hacer nada adicional. Cualquier request posterior a que el `"token"` nuevo esté escrito ya usaría ese valor, incluso antes de que ocurra la recarga.

**La recarga completa no existe por necesidad de Axios** — existe por el residuo de estado en componentes de React (auditoría, pregunta 11). Axios, por sí solo, ya se comporta correctamente sin ella.

**Requests en curso al momento del cambio:** un request ya enviado no puede cambiar sus propios headers a mitad de camino — eso ya lo impide el propio protocolo HTTP, no es algo que este diseño deba resolver. Si la respuesta de un request en vuelo llega después de iniciado el cambio pero antes de que la recarga se complete, en el peor caso actualiza brevemente un componente que está a punto de destruirse — mismo riesgo, de milisegundos, ya aceptado en `DISENO_BLOQUE10.3_ACCESO_MULTIEMPRESA.md`, sección 10, sin necesitar manejo especial nuevo.

---

## 9. Administración visual de accesos

**Quién la ve:** exclusivamente `ADMINISTRADOR` — mismo criterio que `RolesGuard` ya exige en `AccesoGrupoController`.

### El problema de identificar al destinatario, verificado contra el código real

`otorgar()` (`acceso-grupo.controller.ts`) exige un `usuarioId` exacto. No existe hoy ningún endpoint de "candidatos" que cruce organizaciones — a diferencia de `IdentidadChoferGrupoController.candidatos()` (10.2), que solo lista dentro de la propia organización. Pedirle a un `ADMINISTRADOR` que tipee un UUID a mano es propenso a error (y, si por accidente coincide con un usuario real no vinculado, un error silencioso). **Segunda extensión mínima de backend, necesaria por el mismo motivo que la sección 2:**

```
GET /grupo-economico/:id/usuarios/buscar?email=...
   (o ?id=... como alternativa)
→ { id, nombre, email, organizacionId, activo }   — o 404 genérico
```

Restringido a `ADMINISTRADOR`, y **solo** encuentra usuarios cuya organización de pertenencia esté, en este momento, en el mismo `GrupoEconomico` que la organización del actor — nunca una búsqueda abierta a cualquier usuario del sistema (instrucción explícita: "no permitir búsqueda arbitraria que exponga usuarios de otras Organizaciones"). Reutiliza exactamente el mismo criterio de campos ya usado por `UsuarioGrupoLookupService.verificarDestinatario()` — este endpoint puede apoyarse en el mismo servicio, agregando un único método nuevo, estrecho, con la misma disciplina ya aplicada en 10.3.a (nunca `passwordHash`, nunca un método genérico).

Este mismo endpoint también resuelve, con el modo `?id=...`, el problema menor de que `GET /grupo-economico/:id/accesos` hoy solo devuelve `usuarioId` crudo (sin nombre) para el listado — sin necesitar un tercer endpoint.

### Diseño de la pantalla

- **Listado:** tabla sobre `GET /grupo-economico/:id/accesos`, enriquecida con una consulta puntual por `id` al endpoint de arriba para mostrar nombre/email en vez del UUID crudo.
- **Otorgar:** formulario con un campo de email (búsqueda exacta) → si se encuentra, muestra nombre/organización para confirmar → `useConfirm()` → `POST /grupo-economico/:id/accesos`.
- **Revocar:** botón por fila → `useConfirm()` (severidad `"high"`, es una acción que remueve acceso) → `DELETE /grupo-economico/:id/accesos/:accesoId`.
- **Validaciones visibles:** se muestran los mensajes que el backend ya devuelve tal cual (genéricos y específicos, según el caso — ya diseñados en 10.3.a) — sin duplicar lógica de negocio en el frontend.
- **Errores:** mismo patrón `useAsyncAction` que el resto del proyecto.
- **Auditoría:** **no hace falta ninguna pantalla nueva.** Verificado contra el código real de `AuditoriaAdministrativa.tsx`: es una tabla completamente genérica sobre `GET /organizacion/auditoria`, sin ningún valor de `accion` hardcodeado, y ya maneja con gracia `usuario: null` (`d.usuario?.nombre || "—"`) — los cuatro eventos nuevos de Grupo Económico (`acceso_grupo_otorgado`, `acceso_grupo_revocado`, `organizacion_activa_cambiada`, `intento_cambio_organizacion_denegado`) ya son visibles ahí, hoy, sin ningún cambio.

---

## 10. Administración del Grupo

**Lo que ya existe (10.1), releído fresco:** `GET /grupo-economico` (consultar), `POST /grupo-economico` (crear), `POST /grupo-economico/:id/organizaciones` (asociar), `POST /grupo-economico/:id/organizaciones/desasociar` (desasociar) — los cuatro `ADMINISTRADOR`, los cuatro actuando siempre sobre `actor.organizacionId`, nunca sobre una organización ajena (ya garantizado por el backend, verificado en 10.1).

**Recomendación: exponer únicamente la consulta (`GET /grupo-economico`) en 10.4** — como una sección más dentro de la administración de accesos (sección 9), mostrando el nombre del grupo y sus organizaciones miembro. **`crear`/`asociar`/`desasociar` quedan fuera de 10.4, como procedimiento administrativo controlado** — coherente con el propio criterio de `ACTA_CIERRE_BLOQUE10.1.md` ("operación de bajísima frecuencia... no necesita una interfaz sofisticada") y con la instrucción de priorizar que ningún `ADMINISTRADOR` controle unilateralmente la topología de otra organización desde una pantalla de autoservicio.

---

## 11. Identidad compartida de Chofer

**Comparación:**
- **Valor operativo hoy:** ninguno hasta que exista un consumidor real — Pago Consolidado (10.5/10.6), todavía no autorizado.
- **Dependencia:** `PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md` marca la dependencia real como `10.2 + 10.3 → 10.5` — el frontend de identidad de chofer no es un prerequisito de 10.4 (acceso multiempresa), es un prerequisito de 10.6 (frontend de Pago Consolidado).
- **Riesgo:** bajo en sí mismo, pero agrega superficie a un bloque ya extenso.
- **Tamaño del bloque:** 10.4, tal como queda diseñado (secciones 2 a 10), ya cubre selector + dos extensiones mínimas de backend + administración de accesos — agregar una pantalla más, para una capacidad sin consumidor todavía, iría contra el criterio de alcance ya fijado en esta misma autorización ("Frontend de Grupo Económico" acotado a acceso/organización).

**Recomendación: queda fuera de 10.4**, coherente con `PLAN_IMPLEMENTACION_GRUPO_ECONOMICO.md`. Se retoma, como su propia pieza, cuando se autorice 10.5/10.6.

---

## 12. Rutas y navegación

- **Selector de Organización:** no es una ruta — vive dentro de `Layout.tsx`, visible en cualquier pantalla.
- **Nueva ruta, solo `ADMINISTRADOR`:** `/administracion/grupo-economico` — una sola pantalla con dos secciones (accesos, sección 9; consulta del grupo, sección 10), no dos rutas separadas, para no sobrecargar el menú.
- **Visibilidad en el menú:** el nuevo ítem de `NAV_ITEMS` (`roles: ["ADMINISTRADOR"]`) se agrega junto a "Usuarios"/"Auditoría Administrativa" — pero, además del filtro de rol ya existente, la propia pantalla debe manejar el caso "mi organización no pertenece a ningún grupo económico" (`GET /grupo-economico` devuelve `null`, ya un caso contemplado desde 10.1) mostrando un estado vacío claro, en vez de ocultar el ítem del menú condicionalmente — más simple, y consistente con cómo ya se comporta el resto del menú (filtra por rol, nunca por si una pantalla "tiene datos").

---

## 13. Seguridad

Confirmado, sin nada nuevo que agregar más allá de lo ya vigente en todo el proyecto:
- Los roles/condiciones del frontend son ayuda de interfaz — nunca la autorización real, que siempre la vuelve a validar el backend (mismo criterio ya aplicado en cada pantalla administrativa existente).
- Ningún dato de `organizacionId`/`grupoId` leído en el navegador se usa para decidir seguridad — solo para decidir qué mostrar; el backend nunca confía en nada que venga del cliente (ya así en 10.1/10.2/10.3.a/10.3.b, sin cambios).
- No se agrega ningún dato sensible nuevo a `localStorage` — la lista de organizaciones accesibles no se persiste (sección 3).
- Ninguna pantalla muestra información de una organización no autorizada — los dos endpoints nuevos (secciones 2 y 9) ya garantizan esto server-side.
- Los errores `403`/`404` se muestran con el mensaje genérico que el propio backend ya devuelve, sin agregar detalle en el cliente.

---

## 14. Pruebas obligatorias

Usuario con una sola organización (selector no aparece, nombre visible); usuario con dos organizaciones (selector aparece); A→B→A; token y `usuario` actualizados correctamente tras cada cambio; recarga completa efectivamente ejecutada; cero datos residuales de la organización anterior en cualquier pantalla ya montada; `ViajeForm.tsx` con cambios sin guardar, avisando antes de una recarga por cambio propio y por cambio recibido de otra pestaña; dos pestañas abiertas, cambio en una, la otra converge; cambio casi simultáneo desde dos pestañas, converge a la última escritura; acceso revocado (token viejo sigue sirviendo para operaciones normales, un nuevo intento de cambio falla); token vencido; `401` y `403` manejados sin filtrar detalles; flujo completo como `ADMINISTRADOR` (otorgar, ver en el listado con nombre resuelto, revocar); usuario con rol no `ADMINISTRADOR` no ve la pantalla de administración pero sí puede usar el selector si tiene acceso; aislamiento verificado entre el Grupo Económico real y cualquier organización ajena; regresión completa del frontend v1.0 y de las pantallas administrativas ya existentes (`Usuarios.tsx`, `AuditoriaAdministrativa.tsx`, `Organizacion.tsx`, `Perfil.tsx`).

---

## 15. Secuencia de implementación

**Tres sub-bloques**, no cuatro — la identidad de chofer (posible cuarto grupo) queda excluida (sección 11).

### 10.4.a — Endpoints mínimos de soporte (backend)

**Objetivo:** que existan los dos endpoints de lectura identificados como necesarios (secciones 2 y 9), sin ningún efecto sobre nada ya cerrado.

**Backend afectado:** `AccesoGrupoController` (o extensión del módulo `grupo-economico`) — dos métodos nuevos: `GET /grupo-economico/organizaciones-accesibles`, `GET /grupo-economico/:id/usuarios/buscar`. Posible método nuevo, estrecho, en `UsuarioGrupoLookupService` (mismo patrón ya establecido en 10.3.a).

**Frontend afectado:** ninguno todavía.

**Riesgos:** bajos — ambos son de solo lectura, sin escritura, sin emisión de tokens, sin cambio a ningún contrato ya cerrado.

**Pruebas:** ambos endpoints devuelven exactamente lo autorizado para el usuario autenticado; ninguno filtra datos de una organización u otro grupo económico; auditoría adversarial acotada a estos dos métodos antes de cerrar (mismo rigor ya aplicado en cada sub-bloque de Bloque 10).

**Rollback:** revertir el commit — ninguna migración, ningún dato mutado.

**Criterio de cierre:** ambos endpoints devuelven exactamente el contrato definido en las secciones 2 y 9, verificados con los usuarios reales de desarrollo.

### 10.4.b — `AuthContext`, selector, recarga completa, multi-pestaña, aviso de cambios sin guardar

**Objetivo:** que un usuario autorizado sepa dónde está, sepa a dónde puede cambiar, y cambie de forma segura y sincronizada.

**Backend afectado:** ninguno — consume lo cerrado en 10.4.a.

**Frontend afectado:** `AuthContext.tsx`, `Layout.tsx`, `api/client.ts` (sin cambios de lógica, solo confirmar el comportamiento ya existente), `ViajeForm.tsx` (hook de `beforeunload`), un hook nuevo (`useOrganizacionesAccesibles`, `useUnsavedChangesGuard`).

**Riesgos:** el más sensible de UX de todo el bloque — mitigado por reutilizar mecanismos ya existentes y probados (`window.location.href`, el propio interceptor de `401`, `useConfirm()`).

**Pruebas:** todas las de la sección 14 relacionadas con el selector, la recarga, y las pestañas múltiples.

**Rollback:** ocultar/retirar el selector — el backend no se ve afectado.

**Criterio de cierre:** el caso real completo (un usuario con acceso a dos organizaciones) cambia de organización desde la interfaz, sin residuos, sincronizado entre pestañas, validado en navegador real.

### 10.4.c — Administración visual de accesos y consulta del Grupo Económico

**Objetivo:** que un `ADMINISTRADOR` otorgue, liste y revoque accesos, y consulte su Grupo Económico, desde la interfaz.

**Backend afectado:** ninguno — consume lo cerrado en 10.4.a y lo ya existente de 10.1/10.3.a.

**Frontend afectado:** una pantalla nueva (`/administracion/grupo-economico`), un ítem nuevo en `NAV_ITEMS`.

**Riesgos:** bajos — reutiliza patrones visuales ya existentes (`Usuarios.tsx`).

**Pruebas:** flujo completo de otorgar/listar/revocar desde la interfaz, con los usuarios reales de desarrollo; verificar que un rol no `ADMINISTRADOR` no accede a la pantalla.

**Rollback:** ocultar/retirar la pantalla y el ítem del menú — sin efecto sobre el backend.

**Criterio de cierre:** el caso real completo se puede ejecutar de punta a punta desde la interfaz.

**Dependencias:** 10.4.a antes que 10.4.b y 10.4.c (ambos consumen sus endpoints); 10.4.b y 10.4.c pueden avanzar en paralelo entre sí una vez cerrado 10.4.a.

---

## 16. Decisiones técnicas pendientes

1. **Aprobar el endpoint `GET /grupo-economico/organizaciones-accesibles`** (sección 2) — imprescindible, toca el backend.
2. **Aprobar el endpoint `GET /grupo-economico/:id/usuarios/buscar`** (sección 9) — imprescindible, toca el backend.
3. **Confirmar que el nombre de la Organización activa se muestra siempre en `Layout.tsx`**, incluso para usuarios sin ningún acceso múltiple (sección 4) — recomendado, no bloqueante.
4. **Confirmar el orden de escritura en `localStorage`** (usuario primero, token al final, sección 5) — orientativo, sin impacto real dado que ambas escrituras son sincrónicas, pero vale la pena fijarlo como convención explícita.
5. **Confirmar `ViajeForm.tsx` como único adoptante del aviso de cambios sin guardar en esta primera versión** (sección 6) — el resto de los formularios queda para después, sin que eso bloquee el cierre de 10.4.
6. **Confirmar que `crear`/`asociar`/`desasociar` Grupo Económico quedan fuera de 10.4** (sección 10).
7. **Confirmar la exclusión de identidad de Chofer de 10.4** (sección 11).
8. **Nombres exactos de rutas y del hook nuevo** — orientativos, sin impacto de diseño.

Ninguna reabre una decisión ya aprobada de Bloque 10.1/10.2/10.3/10.3.b.

---

No se escribió código, no se modificó ningún archivo existente, no se generaron migraciones, no se hizo commit ni push, no se abrió implementación, no se alteró SDC v1.0.0 ni su tag. Este es el único documento generado. Detenido al finalizar, a la espera de tu aprobación antes de iniciar cualquier implementación.
