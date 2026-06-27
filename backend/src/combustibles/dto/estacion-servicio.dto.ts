export class CreateEstacionServicioDto {
  nombre: string;
  localidad: string;
  direccion?: string;
  telefono?: string;
  contacto?: string;
  email?: string;
  coordenadas?: string; // JSON: {"lat": -32.94, "lng": -60.74}
}

export class UpdateEstacionServicioDto {
  nombre?: string;
  localidad?: string;
  direccion?: string;
  telefono?: string;
  contacto?: string;
  email?: string;
  coordenadas?: string;
  activa?: boolean;
}
