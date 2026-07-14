import { IsEmail } from "class-validator";

export class RecuperarContrasenaDto {
  @IsEmail()
  email: string;
}
