import { ArrayNotEmpty, IsArray, IsDateString, IsNotEmpty, IsString } from "class-validator";

export class CreateFacturaDto {
  @IsString()
  @IsNotEmpty()
  clienteId: string;

  @IsString()
  @IsNotEmpty()
  numero: string;

  @IsDateString()
  fecha: string;

  @IsDateString()
  vencimiento: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Debe incluir al menos un viaje" })
  @IsString({ each: true })
  viajeIds: string[];
}
