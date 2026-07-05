import { IsOptional, IsString } from "class-validator";

export class CancelarViajeDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
