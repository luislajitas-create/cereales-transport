-- Bloque 8.1.b.2.4 — Backfill, cuarta y última tanda.
-- Asigna la organizacionId de la Organización Principal (ya existente) a todas las filas
-- todavía sin organizacionId de: Factura, FacturaViaje, Cobranza, Liquidacion,
-- LiquidacionViaje, LiquidacionMovimiento, AnticipoGasto, AuditLog. No crea ninguna
-- organización nueva. No agrega NOT NULL, no toca unicidades, no agrega foreign keys
-- compuestas. Con esta etapa se completa el backfill de las 20 tablas organizacionales.

DO $$
DECLARE
  v_organizacion_id TEXT;
BEGIN
  SELECT id INTO v_organizacion_id FROM "Organizacion" WHERE nombre = 'Organización Principal' LIMIT 1;

  IF v_organizacion_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró la Organización Principal. Las etapas anteriores del backfill deben aplicarse antes que esta.';
  END IF;

  UPDATE "Factura" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "FacturaViaje" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Cobranza" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "Liquidacion" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "LiquidacionViaje" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "LiquidacionMovimiento" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "AnticipoGasto" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
  UPDATE "AuditLog" SET "organizacionId" = v_organizacion_id WHERE "organizacionId" IS NULL;
END $$;
