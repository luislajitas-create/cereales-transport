# SDC v1.1 — Notas de versión

**¿Qué agrega SDC v1.1 sobre la versión certificada v1.0?** Este documento responde esa pregunta para quien necesite entenderlo sin leer código ni documentación técnica. Da por leído y vigente `RELEASE_SDC_v1.0.md` — no repite su contenido, solo agrega lo nuevo. El detalle técnico completo de cómo se construyó y validó cada pieza vive en `docs/cierres/HITO_ESTABILIZACION_v1.1.md`.

---

## 1. En una frase

SDC v1.1 permite que dos o más organizaciones que pertenecen al mismo grupo económico real —por ejemplo, dos CUIT distintos de la misma empresa— compartan, de forma explícita y controlada, la identidad de un chofer que trabaja para ambas y el acceso de un administrador para operar más de una sin necesitar una cuenta separada por cada organización — sin romper, en ningún caso, el aislamiento de datos entre organizaciones que v1.0 ya garantizaba.

---

## 2. Capacidades nuevas

**Grupo Económico:**
- Un `ADMINISTRADOR` puede crear un Grupo Económico y asociar su organización — y solo la suya — a él.
- Ninguna organización puede quedar asociada a más de un grupo a la vez.

**Identidad compartida de Chofer:**
- Un `ADMINISTRADOR` puede vincular manualmente, con revisión explícita (nunca automática por coincidencia de nombre), a un chofer de su organización con el chofer equivalente de otra organización del mismo grupo — reconociendo que es la misma persona real.
- Cada chofer sigue siendo, en todo lo demás, completamente independiente en su propia organización: sus viajes, anticipos, liquidaciones y comisión no se mezclan ni se comparten por el solo hecho del vínculo.
- El vínculo es reversible en cualquier momento, y queda siempre registrado en la auditoría (quién lo hizo y cuándo).

**Acceso multiempresa:**
- Un `ADMINISTRADOR` puede otorgarle a un usuario de otra organización del mismo grupo la capacidad de operar la suya — con el mismo rol que ese usuario ya tiene en su organización de origen.
- Ese acceso se puede revocar en cualquier momento, sin efecto sobre nada que ya se haya hecho mientras estuvo vigente.
- Un usuario con acceso otorgado puede cambiar de organización activa desde la propia aplicación, sin cerrar sesión ni volver a loguearse — su sesión, y el tiempo que le queda, se conserva exactamente igual al cambiar.
- El cambio se sincroniza automáticamente entre pestañas del navegador abiertas al mismo tiempo.
- Si hay datos sin guardar en la pantalla de carga de un viaje, el sistema avisa antes de cambiar de organización — sin importar si el cambio lo inició la propia pestaña u otra.

**Administración visual:**
- Todo lo anterior (otorgar, ver y revocar accesos) se administra desde una pantalla nueva de la aplicación — sin necesitar, en ningún caso, acceso técnico a la base de datos.

---

## 3. Lo que NO cambia

- El aislamiento entre organizaciones que **no** pertenecen al mismo grupo económico sigue siendo exactamente el mismo de v1.0 — total, sin ninguna excepción nueva.
- Ninguna organización puede ver, editar ni relacionar datos de otra organización, del mismo grupo o no, salvo el acceso explícito y reversible descrito arriba.
- Los seis roles del sistema y sus permisos no cambiaron.
- Ningún dato financiero (viajes, facturas, liquidaciones, anticipos) cambió de forma ni de comportamiento.

---

## 4. Deliberadamente fuera de esta versión

- **Pago Consolidado** — agrupar liquidaciones cerradas de distintas organizaciones del grupo (mismo chofer) en un único pago. Es, de hecho, el caso real que motivó todo este desarrollo, y queda como el paso siguiente natural sobre esta misma base — no autorizado todavía.
- **Autoservicio de topología del grupo** — crear, asociar o desasociar organizaciones de un grupo sigue siendo una operación administrativa puntual, sin una pantalla dedicada más allá de la consulta básica.
- **Pantalla de administración de identidad de chofer** — el vínculo existe y funciona, pero no tiene todavía una pantalla propia (su único consumidor real es Pago Consolidado, todavía no autorizado).

---

## 5. Seguridad

Cada capacidad nueva de esta versión fue sometida a una revisión adversarial explícita, buscando activamente demostrar que estaba mal, no asumiendo que estaba bien — con dos hallazgos reales encontrados y corregidos antes de cualquier cierre (una condición de carrera en el vínculo de chofer, y una confusión entre la organización de pertenencia de un usuario y la organización que tiene activa en un momento dado). El otorgamiento y la revocación de acceso quedan siempre bajo control exclusivo del administrador de la organización involucrada — nunca de la organización que recibe el acceso, nunca de un tercero. Todo queda auditado: quién otorgó, quién revocó, quién cambió de organización y cuándo.

---

## 6. Estado en producción

El código de esta versión está desplegado y verificado en producción. **Todavía no existe ningún Grupo Económico real creado** — la incorporación del primer caso real (las organizaciones reales del cliente que motivó este desarrollo) es una decisión y una acción separadas, pendientes de autorización explícita, no una tarea técnica pendiente.

---

**SDC v1.1 queda documentado y en condiciones de estabilizarse como versión**, sujeto a la misma revisión y aprobación formal que certificó v1.0 — ninguna versión de SDC se da por lanzada por decisión del proceso que la construye.
