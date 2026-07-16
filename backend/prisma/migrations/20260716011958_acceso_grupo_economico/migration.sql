-- CreateTable
CREATE TABLE "AccesoGrupoEconomico" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "otorgadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoGrupoEconomico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccesoGrupoEconomico_usuarioId_idx" ON "AccesoGrupoEconomico"("usuarioId");

-- CreateIndex
CREATE INDEX "AccesoGrupoEconomico_organizacionId_idx" ON "AccesoGrupoEconomico"("organizacionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoGrupoEconomico_usuarioId_organizacionId_key" ON "AccesoGrupoEconomico"("usuarioId", "organizacionId");

-- AddForeignKey
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT "AccesoGrupoEconomico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT "AccesoGrupoEconomico_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoGrupoEconomico" ADD CONSTRAINT "AccesoGrupoEconomico_otorgadoPorId_fkey" FOREIGN KEY ("otorgadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
