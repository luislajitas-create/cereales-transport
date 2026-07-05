import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

export class CreateViajeDto {
  @IsDateString()
  fecha: string;

  @IsString()
  @IsNotEmpty()
  cartaPorte: string;

  @IsString()
  @IsNotEmpty()
  ctg: string;

  @IsString()
  @IsNotEmpty()
  cerealId: string;

  @IsString()
  @IsNotEmpty()
  clienteId: string;

  @IsOptional()
  @IsString()
  productorId?: string;

  @IsString()
  @IsNotEmpty()
  transportistaId: string;

  @IsString()
  @IsNotEmpty()
  choferId: string;

  @IsString()
  @IsNotEmpty()
  camionId: string;

  @IsOptional()
  @IsString()
  acopladoId?: string;

  @IsString()
  @IsNotEmpty()
  origenId: string;

  @IsString()
  @IsNotEmpty()
  destinoId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  toneladas: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  tarifaTonelada: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
