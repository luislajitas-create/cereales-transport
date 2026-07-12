-- Bloque 8.1.b.2.3 — Backfill, tercera tanda.
-- Asigna la organizacionId de la Organización Principal (ya existente) a todas las filas
-- todavía sin organizacionId de: Viaje, HistorialEstadoViaje. No crea ninguna organización
-- nueva. No agrega NOT NULL, no toca unicidades, no agrega foreign keys compuestas.

DO $$
DECLARE
  v_organizacion_id TEXT;
BEGIN
  SELECT id INTO v_organizacion_id FROM "Organizacion" WHERE nombre = 'Organización Principal' LIMIT 1;

  IF v_organizacion_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la Organización Principal. Las etapas anteriores del backfill deben aplicarse antes que esta.';
  END IF;

  UPDATE "Viaje" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "HistorialEstadoViaje" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
END $$;
