import { IsOptional, IsString } from "class-validator";

export class AnularCobranzaDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
