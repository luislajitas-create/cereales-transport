-- AlterTable
ALTER TABLE "Chofer" ADD COLUMN     "identidadChoferGrupoId" TEXT;

-- CreateTable
CREATE TABLE "IdentidadChoferGrupo" (
    "id" TEXT NOT NULL,
    "grupoEconomicoId" TEXT NOT NULL,
    "nombreReferencia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" TEXT,

    CONSTRAINT "IdentidadChoferGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentidadChoferGrupo_grupoEconomicoId_idx" ON "IdentidadChoferGrupo"("grupoEconomicoId");

-- CreateIndex
CREATE INDEX "Chofer_identidadChoferGrupoId_idx" ON "Chofer"("identidadChoferGrupoId");

-- AddForeignKey
ALTER TABLE "Chofer" ADD CONSTRAINT "Chofer_identidadChoferGrupoId_fkey" FOREIGN KEY ("identidadChoferGrupoId") REFERENCES "IdentidadChoferGrupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentidadChoferGrupo" ADD CONSTRAINT "IdentidadChoferGrupo_grupoEconomicoId_fkey" FOREIGN KEY ("grupoEconomicoId") REFERENCES "GrupoEconomico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
