-- Bloque 9.1 — modelo PasswordResetToken.
-- Token de un solo uso para activación de cuenta nueva y recuperación de contraseña
-- (BLOQUE9_DISENO_ADMINISTRACION.md, secciones 4 y 5). Nace multiempresa desde el
-- origen: organizacionId directo + FK compuesta hacia Usuario, siguiendo exactamente
-- el patrón ya cerrado en Bloque 8.1.b.4.3. Migración puramente aditiva.

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_organizacionId_idx" ON "PasswordResetToken"("organizacionId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_usuarioId_idx" ON "PasswordResetToken"("usuarioId");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_usuarioId_organizacionId_fkey" FOREIGN KEY ("usuarioId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE CASCADE ON UPDATE CASCADE;

