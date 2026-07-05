import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ContactoDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
