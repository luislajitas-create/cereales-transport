-- Bloque 8.1.b.2.1 — Backfill, primera tanda.
-- Crea la primera Organización (idempotente: si ya existe, la reutiliza) y asigna su id a
-- todas las filas todavía sin organizacionId de: Usuario, Cliente, Productor, Transportista,
-- Cereal, Ubicacion, TipoGasto. No toca ninguna otra tabla — el resto del backfill queda para
-- las etapas 8.1.b.2.2, 8.1.b.2.3 y 8.1.b.2.4. No agrega NOT NULL, no toca unicidades, no
-- agrega foreign keys compuestas, no borra ni mueve ningún dato — solo etiqueta filas ya
-- existentes.

DO $$
DECLARE
  v_organizacion_id TEXT;
BEGIN
  SELECT id INTO v_organizacion_id FROM "Organizacion" WHERE nombre = 'Organización Principal' LIMIT 1;

  IF v_organizacion_id IS NULL THEN
    v_organizacion_id := gen_random_uuid()::text;
    INSERT INTO "Organizacion" (id, nombre, "createdAt")
    VALUES (v_organizacion_id, 'Organización Principal', now());
  END IF;

  UPDATE "Usuario" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Cliente" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Productor" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Transportista" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Cereal" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Ubicacion" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "TipoGasto" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
END $$;
