-- Bloque 9.4: campos de datos institucionales en Organizacion (nullable, aditivos).
-- razonSocial, cuit (unico global), domicilio, telefono, email, zonaHoraria, moneda.

-- AlterTable
ALTER TABLE "Organizacion" ADD COLUMN     "cuit" TEXT,
ADD COLUMN     "domicilio" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "moneda" TEXT,
ADD COLUMN     "razonSocial" TEXT,
ADD COLUMN     "telefono" TEXT,
ADD COLUMN     "zonaHoraria" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organizacion_cuit_key" ON "Organizacion"("cuit");

