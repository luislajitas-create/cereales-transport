import { BenchmarkingController } from "./benchmarking.controller";
import { BenchmarkingService } from "./benchmarking.service";

// UX-FIN-1 (corrección, sección 6): comparacion() calcula hastaActual con finDeFechaUtc (fin de
// día UTC) en vez de medianoche UTC cruda. Ese cambio de instante SÍ introdujo un off-by-one real
// en el cálculo automático del "período anterior" (sin desdeAnterior/hastaAnterior explícitos):
// diferenciaEnDias() normaliza sus operandos con .setHours() (hora LOCAL del proceso —
// shared/fecha.ts), y un valor "medianoche" junto a un valor "fin de día" del mismo día UTC pueden
// normalizar a días de calendario LOCAL distintos si esa TZ local no es UTC — descubierto acá
// porque process.env.TZ reasignado en beforeAll NO alcanza a cambiar la TZ efectiva que ya usa
// Intl/Date en este proceso de Jest (queda fija en la TZ del sistema operativo, en esta máquina de
// desarrollo America/Buenos_Aires — confirmado con Intl.DateTimeFormat().resolvedOptions()), así
// que estos tests corrieron, sin querer, bajo una TZ real distinta a UTC y expusieron la asimetría.
// El fix (benchmarking.controller.ts) calcula la duración contra la medianoche UTC cruda de
// "hasta", no contra hastaActual, reproduciendo exactamente la aritmética previa a este bloque —
// por eso el resultado ahora es correcto sin importar la TZ efectiva del proceso. El beforeAll de
// abajo se deja solo para dejar registrado el intento (documentado como no-op en este entorno);
// normalizarFecha()/hoyNormalizado() en sí (usadas también por Aging/Alertas/Vigencia/Dashboard,
// fuera del alcance de UX-FIN-1) siguen dependiendo de la TZ efectiva del proceso — riesgo
// preexistente, no introducido ni resuelto acá.
function crearServicioEspia() {
  const comparar = jest.fn().mockResolvedValue({ actual: {}, anterior: {} });
  const evolucionMensual = jest.fn().mockResolvedValue({ serie: [] });
  const rankings = jest.fn().mockResolvedValue({ items: [] });
  const service = { comparar, evolucionMensual, rankings } as unknown as BenchmarkingService;
  return { service, comparar, evolucionMensual, rankings };
}

describe("BenchmarkingController — hastaActual a fin de día no altera la aritmética de período (UX-FIN-1 §6)", () => {
  const TZ_ORIGINAL = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it("comparacion() sin período anterior explícito: duración y fechas del período anterior son idénticas usando fin de día o medianoche cruda como hastaActual", async () => {
    const { service, comparar } = crearServicioEspia();
    const controller = new BenchmarkingController(service);

    await controller.comparacion("2026-08-01", "2026-08-07");

    const [, , desdeAnterior, hastaAnterior] = comparar.mock.calls[0];
    // Período actual: 01/08 al 07/08 = 7 días. El período anterior equivalente debe ser
    // 25/07 al 31/07 (7 días también), exactamente como si hastaActual fuera medianoche cruda —
    // porque diferenciaEnDias normaliza ambos operandos a medianoche antes de restar.
    expect(desdeAnterior.toISOString().slice(0, 10)).toBe("2026-07-25");
    expect(hastaAnterior.toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("comparacion() con un solo día de rango: período anterior también es un solo día, sin off-by-one", async () => {
    const { service, comparar } = crearServicioEspia();
    const controller = new BenchmarkingController(service);

    await controller.comparacion("2026-08-07", "2026-08-07");

    const [, , desdeAnterior, hastaAnterior] = comparar.mock.calls[0];
    expect(desdeAnterior.toISOString().slice(0, 10)).toBe("2026-08-06");
    expect(hastaAnterior.toISOString().slice(0, 10)).toBe("2026-08-06");
  });

  it("comparacion() con período anterior explícito: se usa finDeFechaUtc igual que el período actual, no queda a medianoche cruda", async () => {
    const { service, comparar } = crearServicioEspia();
    const controller = new BenchmarkingController(service);

    await controller.comparacion("2026-08-01", "2026-08-07", "2026-07-01", "2026-07-07");

    const [, , , hastaAnterior] = comparar.mock.calls[0];
    expect(hastaAnterior.toISOString()).toBe("2026-07-07T23:59:59.999Z");
  });

  it("evolucion() y rankings() no lanzan ni alteran el conteo de meses/período solicitado por el fin-de-día en 'hasta'", async () => {
    const { service, evolucionMensual, rankings } = crearServicioEspia();
    const controller = new BenchmarkingController(service);

    await controller.evolucion("6", "2026-08-07");
    expect(evolucionMensual).toHaveBeenCalledWith(6, expect.any(Date));
    expect(evolucionMensual.mock.calls[0][1].toISOString()).toBe("2026-08-07T23:59:59.999Z");

    await controller.rankings("2026-08-01", "2026-08-07", "5");
    const [periodoDesde, periodoHasta, topN] = rankings.mock.calls[0];
    expect(periodoDesde.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(periodoHasta.toISOString()).toBe("2026-08-07T23:59:59.999Z");
    expect(topN).toBe(5);
  });
});
