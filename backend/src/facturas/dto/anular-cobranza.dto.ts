import { IsNotEmpty, IsString } from "class-validator";

export class AnularCobranzaDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
