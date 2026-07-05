import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

export class UpdateViajeDto {
  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @IsString()
  cartaPorte?: string;

  @IsOptional()
  @IsString()
  ctg?: string;

  @IsOptional()
  @IsString()
  cerealId?: string;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @IsString()
  productorId?: string;

  @IsOptional()
  @IsString()
  transportistaId?: string;

  @IsOptional()
  @IsString()
  choferId?: string;

  @IsOptional()
  @IsString()
  camionId?: string;

  @IsOptional()
  @IsString()
  acopladoId?: string;

  @IsOptional()
  @IsString()
  origenId?: string;

  @IsOptional()
  @IsString()
  destinoId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  toneladas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  tarifaTonelada?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
