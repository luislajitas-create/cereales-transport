import { registerDecorator, ValidationOptions } from "class-validator";
import { esCuitValido } from "./cuit";

// Envuelve esCuitValido() (función pura, testeada por separado) como validador de DTO —
// mismo criterio que el resto de las validaciones del sistema: la regla vive en el DTO, no en
// el controller ni en el servicio.
export function EsCuitValido(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "esCuitValido",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === "string" && esCuitValido(value);
        },
        defaultMessage(): string {
          return "El CUIT no es válido (dígito verificador incorrecto).";
        },
      },
    });
  };
}
