-- CAT-6: normalización de CUIT en Organizacion y Productor — los dos campos que CAT-3 dejó
-- explícitamente fuera de alcance (ver AUDITORIA_CATALOGOS.md, sección CAT-3). Reescribe a
-- formato canónico (solo dígitos) los valores YA EXISTENTES, para que queden consistentes con la
-- política que desde ahora aplica el backend en cada alta/edición (backend/src/common/
-- normalizacion.ts, normalizarCuit()/normalizarCuitOpcional()).
--
-- Alcance de cada restricción única (relevante para el chequeo de colisiones de abajo):
--   - Organizacion.cuit: @unique GLOBAL (Organizacion no tiene organizacionId propio — es la
--     raíz del tenant). La colisión se busca en TODA la tabla, sin agrupar por organización.
--   - Productor.cuit: @@unique([organizacionId, cuit]) — POR organización, igual que
--     Cliente.cuit/Transportista.cuit en CAT-3. La colisión se busca agrupando por
--     (organizacionId, valor normalizado).
--
-- Política CAT-6 para valores no nulos que normalizan a cadena vacía (ej. "---", solo
-- separadores sin ningún dígito): a diferencia de Chofer.dni en CAT-3 (que los limpiaba
-- automáticamente a NULL), acá se ABORTA la migración completa — podría ser un CUIT real mal
-- tipeado que merece revisión manual, no una limpieza silenciosa. La única excepción es la
-- cadena vacía literal ('', ya guardada por un comportamiento del backend anterior a CAT-6 en
-- UpdateOrganizacionDto, que no convertía "" a null): esa sí pasa a NULL, porque es exactamente
-- la misma semántica que la nueva política del DTO le da a un CUIT vacío informado.
--
-- Salvaguarda obligatoria: antes de escribir nada, cada bloque verifica que ninguna colisión
-- aparecería después de normalizar, respetando el alcance real de su propia restricción única. Si
-- encuentra una colisión o un valor inseguro, aborta con RAISE EXCEPTION en vez de decidir
-- automáticamente qué hacer.
--
-- Atomicidad real (BEGIN/COMMIT explícitos): Prisma Migrate, para PostgreSQL, NO envuelve
-- automáticamente cada migration.sql en una transacción — es opt-in agregando BEGIN/COMMIT
-- explícitos (confirmado por Prisma: https://www.prisma.io/blog/prisma-migrate-dx-primitives).
-- Sin este BEGIN/COMMIT, un RAISE EXCEPTION en el bloque de Productor (el último) no habría
-- revertido el UPDATE ya confirmado del bloque de Organizacion, dejando una normalización
-- PARCIAL — exactamente lo que esta migración existe para evitar. Con BEGIN al inicio y COMMIT al
-- final, ambos chequeos y ambos UPDATE corren en una única transacción real: cualquier
-- RAISE EXCEPTION no capturado deja la transacción en estado abortado, y el COMMIT final se
-- traduce en un ROLLBACK completo. Ninguna sentencia de este archivo (bloques DO $$ ... $$,
-- UPDATE) es incompatible con ejecutarse dentro de una transacción explícita.
BEGIN;

-- Organizacion.cuit (restricción @unique GLOBAL, sin organizacionId)
DO $$
DECLARE
  v_normalizado text;
  v_cant int;
  v_valor_inseguro text;
BEGIN
  -- Colisiones: dos o más organizaciones cuyo CUIT coincidiría tras normalizar. Se excluyen NULL
  -- y '' del agrupamiento — ambos se resuelven a NULL más abajo, y NULL nunca colisiona consigo
  -- mismo en una restricción única de Postgres.
  SELECT regexp_replace(cuit, '\D', '', 'g'), count(*)
    INTO v_normalizado, v_cant
    FROM "Organizacion"
    WHERE cuit IS NOT NULL AND cuit <> ''
    GROUP BY regexp_replace(cuit, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-6: colision al normalizar Organizacion.cuit (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_cant, v_normalizado;
  END IF;

  -- Valores no nulos y no vacíos que normalizarían a cadena vacía (ej. "-", solo separadores):
  -- nunca se convierten a NULL en silencio — se aborta para revisión manual.
  SELECT cuit INTO v_valor_inseguro
    FROM "Organizacion"
    WHERE cuit IS NOT NULL AND cuit <> '' AND regexp_replace(cuit, '\D', '', 'g') = ''
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-6: Organizacion.cuit = "%" no es nulo/vacio pero normaliza a cadena vacia. Migracion abortada — revisar manualmente.', v_valor_inseguro;
  END IF;
END $$;

-- '' (cadena vacía literal) pasa a NULL — mismo criterio que la nueva normalización del DTO,
-- nunca un caso inseguro (a diferencia de un valor con separadores sin dígitos, chequeado arriba).
UPDATE "Organizacion" SET cuit = NULL WHERE cuit = '';

UPDATE "Organizacion"
SET cuit = regexp_replace(cuit, '\D', '', 'g')
WHERE cuit IS NOT NULL AND cuit IS DISTINCT FROM regexp_replace(cuit, '\D', '', 'g');

-- Productor.cuit (restricción @@unique([organizacionId, cuit]) — POR organización)
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
  v_valor_inseguro text;
BEGIN
  SELECT "organizacionId", regexp_replace(cuit, '\D', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Productor"
    WHERE cuit IS NOT NULL AND cuit <> ''
    GROUP BY "organizacionId", regexp_replace(cuit, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-6: colision al normalizar Productor.cuit en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;

  SELECT cuit INTO v_valor_inseguro
    FROM "Productor"
    WHERE cuit IS NOT NULL AND cuit <> '' AND regexp_replace(cuit, '\D', '', 'g') = ''
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-6: Productor.cuit = "%" no es nulo/vacio pero normaliza a cadena vacia. Migracion abortada — revisar manualmente.', v_valor_inseguro;
  END IF;
END $$;

UPDATE "Productor" SET cuit = NULL WHERE cuit = '';

UPDATE "Productor"
SET cuit = regexp_replace(cuit, '\D', '', 'g')
WHERE cuit IS NOT NULL AND cuit IS DISTINCT FROM regexp_replace(cuit, '\D', '', 'g');

COMMIT;
