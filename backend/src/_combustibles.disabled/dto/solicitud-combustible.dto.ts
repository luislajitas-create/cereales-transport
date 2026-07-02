export class CreateSolicitudCombustibleDto {
  choferId: string;
  transportistaId: string;
  estacionId: string;
  cantidadSolicitada: number; // litros
  precioEstimado: number; // ARS
  fecha: string;
  observaciones?: string;
}

export class UpdateSolicitudCombustibleDto {
  cantidadSolicitada?: number;
  estacionId?: string;
  precioEstimado?: number;
  fecha?: string;
  observaciones?: string;
}

export class AuthorizeSolicitudDto {
  observaciones?: string;
}

export class RejectSolicitudDto {
  motivo: string;
}

export class ModifySolicitudDto {
  cantidadSolicitada?: number;
  estacionId?: string;
  precioEstimado?: number;
  fecha?: string;
  observaciones?: string;
}

export class ReceiveFuelDto {
  cantidadRecibida: number; // actual litros
  precioFinal: number; // actual ARS
  comprobante?: string; // URL
  motivoDiscrepancia?: string;
}

export class DispatchSolicitudDto {
  numeroDespacho?: string;
}
