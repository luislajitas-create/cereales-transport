import { IsBoolean, IsOptional, IsString } from "class-validator";

export class UpdateTransportistaDto {
  @IsOptional()
  @IsString()
  razonSocial?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  domicilio?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
