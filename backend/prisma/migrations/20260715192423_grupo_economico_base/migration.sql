-- AlterTable
ALTER TABLE "Organizacion" ADD COLUMN     "grupoEconomicoId" TEXT;

-- CreateTable
CREATE TABLE "GrupoEconomico" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrupoEconomico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organizacion_grupoEconomicoId_idx" ON "Organizacion"("grupoEconomicoId");

-- AddForeignKey
ALTER TABLE "Organizacion" ADD CONSTRAINT "Organizacion_grupoEconomicoId_fkey" FOREIGN KEY ("grupoEconomicoId") REFERENCES "GrupoEconomico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
