import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTransportistaDto {
  @IsString()
  @IsNotEmpty()
  razonSocial: string;

  @IsString()
  @IsNotEmpty()
  cuit: string;

  @IsOptional()
  @IsString()
  domicilio?: string;
}
