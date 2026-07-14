import { IsNotEmpty, IsString } from "class-validator";

export class UpdatePerfilDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
}
