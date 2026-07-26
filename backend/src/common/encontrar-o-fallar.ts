import { NotFoundException } from "@nestjs/common";

// Bloque 11, H-01 — evita repetir "if (!x) throw new NotFoundException(...)" en cada findOne
// nuevo (patrón ya usado, inline, en viajes/facturas/liquidaciones/anticipos). Usar en
// cualquier findOne nuevo que reciba un id desde la URL. No aplica a lookups por
// actor.organizacionId/actor.id (esos nunca tienen la noción de "id ajeno").
export function encontrarOFallar<T>(valor: T | null | undefined, mensaje: string): T {
  if (valor === null || valor === undefined) {
    throw new NotFoundException(mensaje);
  }
  return valor;
}
