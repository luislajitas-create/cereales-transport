import { IsNotEmpty, IsString } from "class-validator";

export class CreateCerealDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}
