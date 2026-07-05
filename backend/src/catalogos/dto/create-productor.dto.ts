import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProductorDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  cuit?: string;

  @IsOptional()
  @IsString()
  localidad?: string;
}
