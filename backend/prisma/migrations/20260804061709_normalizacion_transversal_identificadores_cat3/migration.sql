-- CAT-3: normalización transversal de identificadores.
-- Reescribe a formato canónico los valores YA EXISTENTES de Cliente.cuit, Transportista.cuit,
-- Chofer.cuil, Chofer.dni y Vehiculo.patente, para que queden consistentes con la política que
-- desde ahora aplica el backend en cada alta/edición/importación (backend/src/common/
-- normalizacion.ts): CUIT/CUIL/DNI -> solo dígitos; patente -> mayúsculas sin espacios/puntos/
-- guiones. Sin esta migración, filas históricas con formato no canónico (ej. "30-12345678-9")
-- quedarían irresolubles para cualquier búsqueda o resolución que compare contra un valor ya
-- normalizado (por ejemplo, transportistaCuit en la importación CSV de Choferes/Vehículos).
--
-- No se toca Organizacion.cuit ni Productor.cuit — fuera del alcance de CAT-3 (ver
-- AUDITORIA_CATALOGOS.md, sección CAT-3). No se cambian IDs, relaciones ni ningún otro campo.
--
-- Salvaguarda obligatoria: antes de escribir nada, cada bloque verifica que NINGUNA organización
-- termine con dos filas cuyo valor normalizado coincida. Si encuentra una colisión, aborta con
-- RAISE EXCEPTION en vez de elegir automáticamente qué registro conservar. Auditoría previa local
-- y productiva (ver AUDITORIA_CATALOGOS.md): 0 colisiones sobre los datos existentes al momento de
-- escribir esta migración — estos chequeos quedan como salvaguarda estructural, no como
-- corrección de un problema detectado.
--
-- Atomicidad real (BEGIN/COMMIT explícitos): Prisma Migrate, para PostgreSQL, NO envuelve
-- automáticamente cada migration.sql en una transacción — es opt-in agregando BEGIN/COMMIT
-- explícitos (confirmado por Prisma: https://www.prisma.io/blog/prisma-migrate-dx-primitives).
-- Sin este BEGIN/COMMIT, cada sentencia de este archivo correría en autocommit: un
-- RAISE EXCEPTION en un bloque posterior (ej. Vehiculo.patente, el último) NO habría revertido
-- los UPDATE ya confirmados por los bloques anteriores (Cliente, Transportista, Chofer),
-- dejando una normalización PARCIAL — exactamente lo que esta migración existe para evitar. Con
-- BEGIN al inicio y COMMIT al final, los cinco chequeos y los cinco UPDATE corren en una única
-- transacción real: cualquier RAISE EXCEPTION no capturado deja la transacción en estado
-- abortado, y el COMMIT final se traduce en un ROLLBACK completo — ningún campo queda
-- normalizado parcialmente. Ninguna sentencia de este archivo (bloques DO $$ ... $$, UPDATE) es
-- incompatible con ejecutarse dentro de una transacción explícita: no hay CREATE INDEX
-- CONCURRENTLY, ALTER TYPE ... ADD VALUE, VACUUM, CREATE/DROP DATABASE, ALTER SYSTEM ni ningún
-- otro comando de los que Postgres restringe dentro de un bloque de transacción.
BEGIN;

-- Cliente.cuit
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
BEGIN
  SELECT "organizacionId", regexp_replace(cuit, '\D', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Cliente"
    GROUP BY "organizacionId", regexp_replace(cuit, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-3: colision al normalizar Cliente.cuit en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;
END $$;

UPDATE "Cliente"
SET cuit = regexp_replace(cuit, '\D', '', 'g')
WHERE cuit IS DISTINCT FROM regexp_replace(cuit, '\D', '', 'g');

-- Transportista.cuit
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
BEGIN
  SELECT "organizacionId", regexp_replace(cuit, '\D', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Transportista"
    GROUP BY "organizacionId", regexp_replace(cuit, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-3: colision al normalizar Transportista.cuit en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;
END $$;

UPDATE "Transportista"
SET cuit = regexp_replace(cuit, '\D', '', 'g')
WHERE cuit IS DISTINCT FROM regexp_replace(cuit, '\D', '', 'g');

-- Chofer.cuil
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
BEGIN
  SELECT "organizacionId", regexp_replace(cuil, '\D', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Chofer"
    GROUP BY "organizacionId", regexp_replace(cuil, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-3: colision al normalizar Chofer.cuil en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;
END $$;

UPDATE "Chofer"
SET cuil = regexp_replace(cuil, '\D', '', 'g')
WHERE cuil IS DISTINCT FROM regexp_replace(cuil, '\D', '', 'g');

-- Chofer.dni (opcional: los NULL se excluyen del chequeo de colisión -- varios choferes sin DNI
-- son válidos -- y un valor que normalice a cadena vacía se guarda como NULL, nunca "").
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
BEGIN
  SELECT "organizacionId", regexp_replace(dni, '\D', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Chofer"
    WHERE dni IS NOT NULL AND regexp_replace(dni, '\D', '', 'g') <> ''
    GROUP BY "organizacionId", regexp_replace(dni, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-3: colision al normalizar Chofer.dni en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;
END $$;

UPDATE "Chofer"
SET dni = NULLIF(regexp_replace(dni, '\D', '', 'g'), '')
WHERE dni IS NOT NULL
  AND dni IS DISTINCT FROM NULLIF(regexp_replace(dni, '\D', '', 'g'), '');

-- Vehiculo.patente
DO $$
DECLARE
  v_organizacion_id text;
  v_normalizado text;
  v_cant int;
BEGIN
  SELECT "organizacionId", regexp_replace(upper(trim(both from patente)), '[\s.-]', '', 'g'), count(*)
    INTO v_organizacion_id, v_normalizado, v_cant
    FROM "Vehiculo"
    GROUP BY "organizacionId", regexp_replace(upper(trim(both from patente)), '[\s.-]', '', 'g')
    HAVING count(*) > 1
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CAT-3: colision al normalizar Vehiculo.patente en organizacion % (% filas comparten el valor normalizado "%"). Migracion abortada, no se modifico nada.',
      v_organizacion_id, v_cant, v_normalizado;
  END IF;
END $$;

UPDATE "Vehiculo"
SET patente = regexp_replace(upper(trim(both from patente)), '[\s.-]', '', 'g')
WHERE patente IS DISTINCT FROM regexp_replace(upper(trim(both from patente)), '[\s.-]', '', 'g');

COMMIT;
