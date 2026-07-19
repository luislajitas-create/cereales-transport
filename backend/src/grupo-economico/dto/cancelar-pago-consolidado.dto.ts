import { IsString, MinLength } from "class-validator";

// Bloque 10.5 — motivo obligatorio, mismo criterio ya usado en el resto del proyecto para
// acciones destructivas de alto impacto.
export class CancelarPagoConsolidadoDto {
  @IsString()
  @MinLength(1)
  motivo!: string;
}
