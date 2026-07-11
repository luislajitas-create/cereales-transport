import { Injectable } from "@nestjs/common";
import { RentabilidadService } from "./rentabilidad.service";
import {
  compararPeriodos,
  calcularEvolucion,
  topBottom,
  ResultadoComparacion,
  ResultadoEvolucion,
  PeriodoRentabilidad,
} from "./benchmarking/benchmarking.calc";
import { AgregadoDimension } from "./reportes/rentabilidad.calc";

export interface RankingDimension {
  ranking: AgregadoDimension[];
  top: AgregadoDimension[];
  bottom: AgregadoDimension[];
}

export interface ResultadoRankings {
  clientes: RankingDimension;
  transportistas: RankingDimension;
  cereales: RankingDimension;
  rutas: RankingDimension;
}

// Bloque 7.3.5 — Benchmarking es un consumidor puro del Motor de Inteligencia: solo
// depende de RentabilidadService (ya lo anticipaba BLOQUE7.3_ARQUITECTURA_DEL_CENTRO_DE_INTELIGENCIA.md,
// Parte 6), nunca consulta Prisma, nunca redefine margen. Llama a RentabilidadService.calcular()
// una o varias veces (una por período que necesite comparar/graficar) y delega todo el
// cálculo de comparación/evolución/recorte a benchmarking.calc.ts.
@Injectable()
export class BenchmarkingService {
  constructor(private rentabilidadService: RentabilidadService) {}

  async comparar(desdeActual: Date, hastaActual: Date, desdeAnterior: Date, hastaAnterior: Date): Promise<ResultadoComparacion> {
    const [actual, anterior] = await Promise.all([
      this.rentabilidadService.calcular(desdeActual, hastaActual),
      this.rentabilidadService.calcular(desdeAnterior, hastaAnterior),
    ]);
    return compararPeriodos(actual, anterior);
  }

  async evolucionMensual(meses: number, hastaReferencia: Date): Promise<ResultadoEvolucion> {
    const rangos = this.mesesHaciaAtras(meses, hastaReferencia);
    const resultados = await Promise.all(rangos.map((r) => this.rentabilidadService.calcular(r.desde, r.hasta)));
    const serie: PeriodoRentabilidad[] = rangos.map((periodo, i) => ({ periodo, resultado: resultados[i] }));
    return calcularEvolucion(serie);
  }

  async rankings(desde: Date, hasta: Date, topN: number): Promise<ResultadoRankings> {
    const resultado = await this.rentabilidadService.calcular(desde, hasta);
    const armar = (dimension: AgregadoDimension[]): RankingDimension => {
      const tb = topBottom(dimension, topN);
      return { ranking: dimension, top: tb.top, bottom: tb.bottom };
    };
    return {
      clientes: armar(resultado.porCliente),
      transportistas: armar(resultado.porTransportista),
      cereales: armar(resultado.porCereal),
      rutas: armar(resultado.porRuta),
    };
  }

  // Genera `meses` rangos [desde,hasta] consecutivos, terminando en `hastaReferencia`
  // (el último rango corta ahí en vez de en fin de mes, los anteriores son meses completos).
  // Construye desde/hasta a partir de año+mes, nunca del día original, para no arrastrar
  // problemas de desborde de día (31 de un mes que el mes anterior no tiene).
  private mesesHaciaAtras(meses: number, hastaReferencia: Date): { desde: Date; hasta: Date }[] {
    const anioRef = hastaReferencia.getFullYear();
    const mesRef = hastaReferencia.getMonth();
    const rangos: { desde: Date; hasta: Date }[] = [];
    for (let i = meses - 1; i >= 0; i--) {
      const mesIndice = mesRef - i;
      const desde = new Date(anioRef, mesIndice, 1);
      const esUltimoMes = i === 0;
      const hasta = esUltimoMes ? hastaReferencia : new Date(anioRef, mesIndice + 1, 0);
      rangos.push({ desde, hasta });
    }
    return rangos;
  }
}
