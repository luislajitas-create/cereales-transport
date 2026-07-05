import { IsNotEmpty, IsString } from "class-validator";

export class AnularAnticipoDto {
  @IsString()
  @IsNotEmpty()
  motivo: string;
}
