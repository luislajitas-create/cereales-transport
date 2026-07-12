-- Bloque 8.1.b.2.2 — Backfill, segunda tanda.
-- Asigna la organizacionId de la Organización Principal (creada en la etapa anterior) a todas
-- las filas todavía sin organizacionId de: Contacto, Chofer, Vehiculo. No toca ninguna otra
-- tabla ni crea ninguna organización nueva — reutiliza exclusivamente la ya existente. No
-- agrega NOT NULL, no toca unicidades, no agrega foreign keys compuestas.

DO $$
DECLARE
  v_organizacion_id TEXT;
BEGIN
  SELECT id INTO v_organizacion_id FROM "Organizacion" WHERE nombre = 'Organización Principal' LIMIT 1;

  IF v_organizacion_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la Organización Principal. Etapa 8.1.b.2.1 debe aplicarse antes que esta.';
  END IF;

  UPDATE "Contacto" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Chofer" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Vehiculo" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
END $$;
