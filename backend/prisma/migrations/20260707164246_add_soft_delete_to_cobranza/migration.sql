-- AlterTable
ALTER TABLE "Cobranza" ADD COLUMN     "anulada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anuladaFecha" TIMESTAMP(3),
ADD COLUMN     "anuladaMotivo" TEXT;
