import { TipoMetodoPago } from "@prisma/client";

export class CreatePagoEstacionDto {
  estacionId: string;
  importePago: number;
  metodoPago: TipoMetodoPago;
  numeroComprobante?: string;
  descripcion?: string;
}

export class ConciliarPagoDto {
  conciliado: boolean;
  observacion?: string;
}
