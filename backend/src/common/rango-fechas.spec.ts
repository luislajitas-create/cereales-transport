import { finDeFechaUtc, rangoDiaEnZona, zonaHorariaValida, ZONA_ARGENTINA_DEFECTO } from "./rango-fechas";

// UX-FIN-1: finDeFechaUtc (Dominio A — fecha de negocio pura) debe devolver siempre el último
// milisegundo del día calendario UTC indicado, sin importar la zona horaria configurada en el
// proceso donde corre — por eso estos tests fijan process.env.TZ a distintos valores y confirman
// que el resultado no cambia.
describe("finDeFechaUtc", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it("devuelve 23:59:59.999 UTC del mismo día para una fecha simple", () => {
    expect(finDeFechaUtc("2026-08-07").toISOString()).toBe("2026-08-07T23:59:59.999Z");
  });

  it("funciona en fin de mes", () => {
    expect(finDeFechaUtc("2026-01-31").toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("funciona en fin de año", () => {
    expect(finDeFechaUtc("2026-12-31").toISOString()).toBe("2026-12-31T23:59:59.999Z");
  });

  it("funciona en 29 de febrero de un año bisiesto", () => {
    expect(finDeFechaUtc("2028-02-29").toISOString()).toBe("2028-02-29T23:59:59.999Z");
  });

  it("incluye un registro con hora real dentro de ese día calendario UTC (el bug que corrige)", () => {
    const limite = finDeFechaUtc("2026-08-07");
    const registroConHoraReal = new Date("2026-08-07T23:59:00.000Z");
    expect(registroConHoraReal.getTime() <= limite.getTime()).toBe(true);
    expect(registroConHoraReal.getTime() > new Date("2026-08-07").getTime()).toBe(true);
  });

  it("excluye un registro del día calendario UTC siguiente", () => {
    const limite = finDeFechaUtc("2026-08-07");
    const registroDiaSiguiente = new Date("2026-08-08T00:00:00.001Z");
    expect(registroDiaSiguiente.getTime() <= limite.getTime()).toBe(false);
  });

  it("el resultado es idéntico sin importar TZ del proceso (UTC, Argentina, o vacío)", () => {
    const resultados = ["UTC", "America/Argentina/Buenos_Aires", ""].map((tz) => {
      process.env.TZ = tz;
      return finDeFechaUtc("2026-08-07").toISOString();
    });
    expect(new Set(resultados).size).toBe(1);
    expect(resultados[0]).toBe("2026-08-07T23:59:59.999Z");
  });
});

describe("zonaHorariaValida", () => {
  it("acepta una zona IANA real", () => {
    expect(zonaHorariaValida("America/Argentina/Salta")).toBe("America/Argentina/Salta");
  });

  it("rechaza un valor no-IANA y devuelve null", () => {
    expect(zonaHorariaValida("Zona/Invalida")).toBeNull();
  });

  it("rechaza null/undefined/cadena vacía", () => {
    expect(zonaHorariaValida(null)).toBeNull();
    expect(zonaHorariaValida(undefined)).toBeNull();
    expect(zonaHorariaValida("")).toBeNull();
  });
});

// UX-FIN-1: rangoDiaEnZona (Dominio B — timestamp real) debe devolver el instante UTC exacto de
// 00:00:00.000 y 23:59:59.999 del día calendario LOCAL en la zona indicada, no del día UTC. Caso
// de referencia del reporte del usuario: evento 07/08/2026 22:30 en Argentina/Salta = 08/08/2026
// 01:30Z — debe quedar incluido en el rango de "hasta 2026-08-07" en esa zona.
describe("rangoDiaEnZona", () => {
  const TZ_ORIGINAL = process.env.TZ;
  afterEach(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  it("caso Argentina/Salta: desde/hasta son los instantes UTC de 00:00 y 23:59:59.999 locales", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    expect(desde.toISOString()).toBe("2026-08-07T03:00:00.000Z");
    expect(hasta.toISOString()).toBe("2026-08-08T02:59:59.999Z");
  });

  it("evento 00:00:00.000 local incluido", () => {
    const { desde } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    const evento = new Date("2026-08-07T03:00:00.000Z"); // 00:00:00.000 Salta
    expect(evento.getTime() >= desde.getTime()).toBe(true);
  });

  it("evento 23:59:59.999 local incluido", () => {
    const { hasta } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    const evento = new Date("2026-08-08T02:59:59.999Z"); // 23:59:59.999 Salta
    expect(evento.getTime() <= hasta.getTime()).toBe(true);
  });

  it("evento tardío del día local queda incluido (el caso reportado: 22:30 Salta = 01:30Z del día siguiente)", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    const evento = new Date("2026-08-08T01:30:00.000Z");
    expect(evento.getTime() >= desde.getTime() && evento.getTime() <= hasta.getTime()).toBe(true);
  });

  it("evento del día local anterior queda excluido", () => {
    const { desde } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    const eventoDiaAnterior = new Date("2026-08-07T02:59:59.999Z"); // 23:59:59.999 Salta del 06/08
    expect(eventoDiaAnterior.getTime() >= desde.getTime()).toBe(false);
  });

  it("evento del día local siguiente queda excluido", () => {
    const { hasta } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
    const eventoDiaSiguiente = new Date("2026-08-08T03:00:00.000Z"); // 00:00:00.000 Salta del 08/08
    expect(eventoDiaSiguiente.getTime() <= hasta.getTime()).toBe(false);
  });

  it("el resultado es idéntico sin importar TZ del proceso (UTC, Argentina, o vacío)", () => {
    const resultados = ["UTC", "America/Argentina/Buenos_Aires", ""].map((tz) => {
      process.env.TZ = tz;
      const { desde, hasta } = rangoDiaEnZona("2026-08-07", ZONA_ARGENTINA_DEFECTO);
      return `${desde.toISOString()}|${hasta.toISOString()}`;
    });
    expect(new Set(resultados).size).toBe(1);
  });

  it("con zona UTC, el rango coincide con finDeFechaUtc (medianoche a medianoche)", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-08-07", "UTC");
    expect(desde.toISOString()).toBe("2026-08-07T00:00:00.000Z");
    expect(hasta.toISOString()).toBe(finDeFechaUtc("2026-08-07").toISOString());
  });
});

// rangoDiaEnZona() acepta cualquier zona IANA, no solo America/Argentina/Salta (que no tiene DST).
// Estos tests cubren America/New_York, que sí observa horario de verano, para confirmar que el
// muestreo de offset (dos iteraciones sobre Intl.DateTimeFormat, ver instanteParaWallClockEnZona
// en rango-fechas.ts) da los instantes UTC correctos incluso en los días de transición — donde el
// día local dura 23 o 25 horas en vez de 24. EE.UU. 2026: DST empieza el 08/03 (2do domingo de
// marzo, 2:00 AM -> 3:00 AM) y termina el 01/11 (1er domingo de noviembre, 2:00 AM -> 1:00 AM).
describe("rangoDiaEnZona — America/New_York (zona con DST)", () => {
  it("día normal de invierno (15/01, EST, UTC-5): límites correctos, duración 24h", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-01-15", "America/New_York");
    expect(desde.toISOString()).toBe("2026-01-15T05:00:00.000Z"); // 00:00:00.000 EST
    expect(hasta.toISOString()).toBe("2026-01-16T04:59:59.999Z"); // 23:59:59.999 EST
    expect(hasta.getTime() - desde.getTime() + 1).toBe(24 * 60 * 60 * 1000);
  });

  it("día normal de verano (15/07, EDT, UTC-4): límites correctos, duración 24h", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-07-15", "America/New_York");
    expect(desde.toISOString()).toBe("2026-07-15T04:00:00.000Z"); // 00:00:00.000 EDT
    expect(hasta.toISOString()).toBe("2026-07-16T03:59:59.999Z"); // 23:59:59.999 EDT
    expect(hasta.getTime() - desde.getTime() + 1).toBe(24 * 60 * 60 * 1000);
  });

  it("día de inicio de DST (08/03): el día local dura 23 horas (2:00 AM salta a 3:00 AM)", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-03-08", "America/New_York");
    expect(desde.toISOString()).toBe("2026-03-08T05:00:00.000Z"); // 00:00:00.000, todavía EST (UTC-5)
    expect(hasta.toISOString()).toBe("2026-03-09T03:59:59.999Z"); // 23:59:59.999, ya EDT (UTC-4)
    expect(hasta.getTime() - desde.getTime() + 1).toBe(23 * 60 * 60 * 1000);
  });

  it("día de fin de DST (01/11): el día local dura 25 horas (2:00 AM retrocede a 1:00 AM)", () => {
    const { desde, hasta } = rangoDiaEnZona("2026-11-01", "America/New_York");
    expect(desde.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // 00:00:00.000, todavía EDT (UTC-4)
    expect(hasta.toISOString()).toBe("2026-11-02T04:59:59.999Z"); // 23:59:59.999, ya EST (UTC-5)
    expect(hasta.getTime() - desde.getTime() + 1).toBe(25 * 60 * 60 * 1000);
  });

  it("evento en el límite exacto de 00:00:00.000 local del día de inicio de DST queda incluido", () => {
    const { desde } = rangoDiaEnZona("2026-03-08", "America/New_York");
    const evento = new Date("2026-03-08T05:00:00.000Z");
    expect(evento.getTime() >= desde.getTime()).toBe(true);
    const eventoUnMsAntes = new Date(desde.getTime() - 1);
    expect(eventoUnMsAntes.getTime() >= desde.getTime()).toBe(false);
  });

  it("evento en el límite exacto de 23:59:59.999 local del día de fin de DST queda incluido", () => {
    const { hasta } = rangoDiaEnZona("2026-11-01", "America/New_York");
    const evento = new Date("2026-11-02T04:59:59.999Z");
    expect(evento.getTime() <= hasta.getTime()).toBe(true);
    const eventoUnMsDespues = new Date(hasta.getTime() + 1);
    expect(eventoUnMsDespues.getTime() <= hasta.getTime()).toBe(false);
  });
});
