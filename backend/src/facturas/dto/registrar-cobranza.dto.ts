import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";
import { Transform, Type } from "class-transformer";

// FAC-4 (ajuste post-revisión): medioPago vuelve a ser texto libre, no una lista cerrada — un
// @IsIn(["TRANSFERENCIA","EFECTIVO"]) convertía una mejora de UX (selector con atajos) en una
// restricción comercial nueva que nadie pidió. El frontend (Facturas.tsx) ofrece TRANSFERENCIA/
// EFECTIVO como atajos más una opción "Otro" que pide una descripción real — lo que llega acá es
// siempre esa descripción o uno de los dos atajos, nunca el literal "OTRO". Ahora es obligatorio:
// toda cobranza nueva debe tener un medio confirmado por quien la registra (antes era opcional).
// Cobranzas históricas con un valor previo/no normalizado o sin medioPago no se tocan: esta
// validación solo aplica a escrituras nuevas a través de este DTO.
const MEDIO_PAGO_LONGITUD_MAXIMA = 60;

// Mismo `recortar` (trim) ya usado en UpdateOrganizacionDto — única normalización aplicada:
// sin mayúsculas forzadas ni colapsado de espacios internos, para no reescribir lo que la
// persona realmente tipeó.
const recortar = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class RegistrarCobranzaDto {
  @IsDateString()
  fecha: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  importe: number;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MEDIO_PAGO_LONGITUD_MAXIMA)
  medioPago: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}
