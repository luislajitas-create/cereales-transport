import { IsString, MinLength } from "class-validator";

export class AceptarInvitacionDto {
  @IsString()
  @MinLength(8)
  contrasena: string;
}
