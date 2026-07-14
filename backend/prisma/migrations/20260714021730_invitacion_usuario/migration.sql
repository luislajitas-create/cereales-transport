-- Bloque 9.6: modelo InvitacionUsuario. El Usuario real se crea recien al aceptar la
-- invitacion, nunca antes (BLOQUE9_DISENO_ADMINISTRACION.md, seccion 5).

-- CreateTable
CREATE TABLE "InvitacionUsuario" (
    "id" TEXT NOT NULL,
    "organizacionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "RolNombre" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "aceptadaEn" TIMESTAMP(3),
    "creadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitacionUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitacionUsuario_tokenHash_key" ON "InvitacionUsuario"("tokenHash");

-- CreateIndex
CREATE INDEX "InvitacionUsuario_organizacionId_idx" ON "InvitacionUsuario"("organizacionId");

-- CreateIndex
CREATE INDEX "InvitacionUsuario_email_idx" ON "InvitacionUsuario"("email");

-- AddForeignKey
ALTER TABLE "InvitacionUsuario" ADD CONSTRAINT "InvitacionUsuario_organizacionId_fkey" FOREIGN KEY ("organizacionId") REFERENCES "Organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitacionUsuario" ADD CONSTRAINT "InvitacionUsuario_creadaPorId_organizacionId_fkey" FOREIGN KEY ("creadaPorId", "organizacionId") REFERENCES "Usuario"("id", "organizacionId") ON DELETE RESTRICT ON UPDATE CASCADE;

