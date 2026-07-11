// Bloque 7.3.1 — cálculo puro de rentabilidad (margen operativo / resultado económico).
// Ver BLOQUE7.3.1_DISENO_RENTABILIDAD.md, secciones 3 y 4, para la definición aprobada.
// Estas funciones no acceden a Prisma ni a HTTP: reciben datos ya leídos y filtrados por
// vigencia (InteligenciaController es responsable de ese filtro, sección 4 del diseño).

export interface FacturaVigente {
  importeViaje: number;
  fecha: Date;
}

export interface LiquidacionVigente {
  totalViaje: number;
  fecha: Date;
}

export interface ViajeEntrada {
  id: string;
  numeroViaje: number;
  fecha: Date;
  clienteId: string;
  cliente: string;
  transportistaId: string;
  transportista: string;
  // Bloque 7.3.5 — dimensiones agregadas para Benchmarking (ranking de cereales/rutas),
  // extensión aditiva de la misma consulta de 7.3.1: no cambia ingreso/costo/margen.
  cerealId: string;
  cereal: string;
  origenId: string;
  origen: string;
  destinoId: string;
  destino: string;
  // Ya filtradas por vigencia (factura.estado !== "ANULADO" / liquidacion.estado !== "ANULADA")
  // por quien arma esta entrada — normalmente 0 o 1 elemento; más de uno es el caso
  // defensivo señalado en el diseño (sección 4), se resuelve tomando la más reciente.
  facturasVigentes: FacturaVigente[];
  liquidacionesVigentes: LiquidacionVigente[];
}

export interface ViajeCalculado {
  viajeId: string;
  numeroViaje: number;
  fecha: Date;
  clienteId: string;
  cliente: string;
  transportistaId: string;
  transportista: string;
  cerealId: string;
  cereal: string;
  origenId: string;
  origen: string;
  destinoId: string;
  destino: string;
  ingreso: number;
  costo: number;
  margen: number;
  margenPct: number;
}

export type MotivoIncompleto = "sin facturar" | "sin liquidar" | "sin facturar y sin liquidar";

export interface ViajeIncompleto {
  viajeId: string;
  numeroViaje: number;
  fecha: Date;
  motivo: MotivoIncompleto;
}

export interface AgregadoDimension {
  id: string;
  nombre: string;
  ingreso: number;
  costo: number;
  margen: number;
  margenPct: number;
  viajes: number;
}

export interface TotalesRentabilidad {
  ingreso: number;
  costo: number;
  margen: number;
  margenPct: number;
  viajesCompletos: number;
  viajesIncompletos: number;
}

export interface ResultadoRentabilidad {
  totales: TotalesRentabilidad;
  porCliente: AgregadoDimension[];
  porTransportista: AgregadoDimension[];
  // Bloque 7.3.5 — mismas dimensiones agregadas que porCliente/porTransportista, sobre
  // cereal y ruta (origen→destino). "id" de porRuta es compuesto (origenId::destinoId)
  // porque una ruta no tiene entidad propia en el modelo transaccional.
  porCereal: AgregadoDimension[];
  porRuta: AgregadoDimension[];
  detalleViajes: ViajeCalculado[];
  viajesIncompletos: ViajeIncompleto[];
}

function masReciente<T extends { fecha: Date }>(filas: T[]): T | null {
  if (filas.length === 0) return null;
  if (filas.length === 1) return filas[0];
  return [...filas].sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
}

function margenPctDe(margen: number, ingreso: number): number {
  return ingreso > 0 ? (margen / ingreso) * 100 : 0;
}

/**
 * Calcula el margen operativo por viaje y su agregación por cliente/transportista,
 * sobre un conjunto de viajes ya filtrado por período (y, opcionalmente, por cliente/
 * transportista) por quien llama. Ver BLOQUE7.3.1_DISENO_RENTABILIDAD.md, sección 4.
 */
export function calcularRentabilidad(viajes: ViajeEntrada[]): ResultadoRentabilidad {
  const detalleViajes: ViajeCalculado[] = [];
  const viajesIncompletos: ViajeIncompleto[] = [];

  for (const v of viajes) {
    const factura = masReciente(v.facturasVigentes);
    const liquidacion = masReciente(v.liquidacionesVigentes);

    if (factura && liquidacion) {
      const ingreso = factura.importeViaje;
      const costo = liquidacion.totalViaje;
      const margen = ingreso - costo;
      detalleViajes.push({
        viajeId: v.id,
        numeroViaje: v.numeroViaje,
        fecha: v.fecha,
        clienteId: v.clienteId,
        cliente: v.cliente,
        transportistaId: v.transportistaId,
        transportista: v.transportista,
        cerealId: v.cerealId,
        cereal: v.cereal,
        origenId: v.origenId,
        origen: v.origen,
        destinoId: v.destinoId,
        destino: v.destino,
        ingreso,
        costo,
        margen,
        margenPct: margenPctDe(margen, ingreso),
      });
    } else {
      const motivo: MotivoIncompleto =
        !factura && !liquidacion ? "sin facturar y sin liquidar" : !factura ? "sin facturar" : "sin liquidar";
      viajesIncompletos.push({ viajeId: v.id, numeroViaje: v.numeroViaje, fecha: v.fecha, motivo });
    }
  }

  const porCliente = agregarPorDimension(detalleViajes, (v) => v.clienteId, (v) => v.cliente);
  const porTransportista = agregarPorDimension(detalleViajes, (v) => v.transportistaId, (v) => v.transportista);
  const porCereal = agregarPorDimension(detalleViajes, (v) => v.cerealId, (v) => v.cereal);
  const porRuta = agregarPorDimension(
    detalleViajes,
    (v) => `${v.origenId}::${v.destinoId}`,
    (v) => `${v.origen} → ${v.destino}`,
  );

  const ingresoTotal = detalleViajes.reduce((acc, v) => acc + v.ingreso, 0);
  const costoTotal = detalleViajes.reduce((acc, v) => acc + v.costo, 0);
  const margenTotal = ingresoTotal - costoTotal;

  return {
    totales: {
      ingreso: ingresoTotal,
      costo: costoTotal,
      margen: margenTotal,
      margenPct: margenPctDe(margenTotal, ingresoTotal),
      viajesCompletos: detalleViajes.length,
      viajesIncompletos: viajesIncompletos.length,
    },
    porCliente,
    porTransportista,
    porCereal,
    porRuta,
    detalleViajes,
    viajesIncompletos,
  };
}

function agregarPorDimension(
  viajes: ViajeCalculado[],
  idDe: (v: ViajeCalculado) => string,
  nombreDe: (v: ViajeCalculado) => string,
): AgregadoDimension[] {
  const acumulado = new Map<string, { nombre: string; ingreso: number; costo: number; viajes: number }>();
  for (const v of viajes) {
    const id = idDe(v);
    const actual = acumulado.get(id) || { nombre: nombreDe(v), ingreso: 0, costo: 0, viajes: 0 };
    actual.ingreso += v.ingreso;
    actual.costo += v.costo;
    actual.viajes += 1;
    acumulado.set(id, actual);
  }
  const filas: AgregadoDimension[] = Array.from(acumulado.entries()).map(([id, a]) => {
    const margen = a.ingreso - a.costo;
    return { id, nombre: a.nombre, ingreso: a.ingreso, costo: a.costo, margen, margenPct: margenPctDe(margen, a.ingreso), viajes: a.viajes };
  });
  return filas.sort((a, b) => b.margen - a.margen);
}
