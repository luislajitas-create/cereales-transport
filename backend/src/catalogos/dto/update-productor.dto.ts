import { IsOptional, IsString } from "class-validator";

export class UpdateProductorDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  localidad?: string;
}
