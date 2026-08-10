// GAP-GE-1: lógica pura del alta self-service de Organización (AltaOrganizacion.tsx), separada
// del componente para poder probarla sin infraestructura de tests de componentes — mismo
// criterio que organizacion-payload.ts (CAT-6).
//
// La normalización real del CUIT (solo dígitos) y la validación del dígito verificador son
// responsabilidad exclusiva del backend (AltaOrganizacionDto — @Transform(siPresente(normalizarCuit))
// + @EsCuitValido()), igual que en el formulario de edición de Organización ya existente. Acá
// solo se recorta espacios — nunca se reformatea el CUIT en el cliente, para no duplicar una
// regla que ya vive en un solo lugar.

export interface AltaOrganizacionForm {
  nombre: string;
  razonSocial: string;
  cuit: string;
  domicilio: string;
  telefono: string;
  administradorNombre: string;
  administradorEmail: string;
  password: string;
  confirmarPassword: string;
}

// undefined (no null): el DTO del backend usa @IsOptional() en estos tres campos, que solo
// acepta undefined — enviar null los rechazaría con "must be a string".
function valorOpcional(valor: string): string | undefined {
  const recortado = valor.trim();
  return recortado === "" ? undefined : recortado;
}

export function construirPayloadAltaOrganizacion(form: AltaOrganizacionForm) {
  return {
    organizacion: {
      nombre: form.nombre.trim(),
      cuit: form.cuit.trim(),
      razonSocial: valorOpcional(form.razonSocial),
      domicilio: valorOpcional(form.domicilio),
      telefono: valorOpcional(form.telefono),
    },
    administrador: {
      nombre: form.administradorNombre.trim(),
      email: form.administradorEmail.trim(),
      password: form.password,
    },
  };
}

// Validación de confirmación de contraseña ANTES de llamar al backend — el DTO solo exige
// @MinLength(8) sobre `password`; la coincidencia con la confirmación es puramente de UX y no
// existe ningún campo "confirmarPassword" en el backend (nunca viaja en el payload).
export function validarConfirmacionPassword(password: string, confirmar: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password !== confirmar) return "Las contraseñas no coinciden.";
  return null;
}
