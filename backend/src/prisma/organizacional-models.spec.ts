// Bloque 11, H-04 — red de seguridad automática. Verifica, contra el schema real (vía DMMF
// de Prisma, sin necesitar una base de datos activa), que todo modelo con un campo escalar
// organizacionId está registrado en exactamente una de las dos listas: ORGANIZACIONAL_MODELS
// (aislamiento automático) o MODELOS_AISLAMIENTO_MANUAL (aislamiento manual, deliberado).
import { Prisma } from "@prisma/client";
import { ORGANIZACIONAL_MODELS } from "./organizacional-models";
import { MODELOS_AISLAMIENTO_MANUAL } from "./modelos-aislamiento-manual";

function modelosConOrganizacionId(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((modelo) => modelo.fields.some((campo) => campo.name === "organizacionId" && campo.kind === "scalar"))
    .map((modelo) => modelo.name);
}

describe("Red de seguridad — modelos organizacionales (Bloque 11, H-04)", () => {
  const modelosReales = modelosConOrganizacionId();
  const listaOrganizacional = ORGANIZACIONAL_MODELS as readonly string[];
  const listaManual = MODELOS_AISLAMIENTO_MANUAL as readonly string[];

  // Modelos faltantes / excepciones no documentadas: un modelo real con organizacionId que
  // no está en ninguna de las dos listas es, según cuál debería ser su tratamiento, una de
  // las dos cosas — estructuralmente, ambas violaciones son la misma comprobación.
  it("todo modelo real con organizacionId debe estar en ORGANIZACIONAL_MODELS o en MODELOS_AISLAMIENTO_MANUAL", () => {
    const faltantes = modelosReales.filter(
      (modelo) => !listaOrganizacional.includes(modelo) && !listaManual.includes(modelo),
    );
    expect(faltantes).toEqual([]);
  });

  // Modelos sobrantes: una entrada de ORGANIZACIONAL_MODELS que ya no corresponde a un
  // modelo real con organizacionId (renombrado, eliminado, o le sacaron el campo).
  it("toda entrada de ORGANIZACIONAL_MODELS debe corresponder a un modelo real con organizacionId", () => {
    const sobrantes = listaOrganizacional.filter((modelo) => !modelosReales.includes(modelo));
    expect(sobrantes).toEqual([]);
  });

  // Excepciones inexistentes: una entrada de MODELOS_AISLAMIENTO_MANUAL que ya no
  // corresponde a un modelo real con organizacionId.
  it("toda entrada de MODELOS_AISLAMIENTO_MANUAL debe corresponder a un modelo real con organizacionId", () => {
    const sobrantes = listaManual.filter((modelo) => !modelosReales.includes(modelo));
    expect(sobrantes).toEqual([]);
  });

  // Excepciones no documentadas / conflicto: ningún modelo puede estar en las dos listas a
  // la vez — sería una contradicción sobre cuál es su tratamiento real.
  it("ningún modelo puede estar simultáneamente en ambas listas", () => {
    const interseccion = listaOrganizacional.filter((modelo) => listaManual.includes(modelo));
    expect(interseccion).toEqual([]);
  });

  // Duplicados dentro de cada lista.
  it("ORGANIZACIONAL_MODELS no debe tener nombres duplicados", () => {
    expect(new Set(listaOrganizacional).size).toBe(listaOrganizacional.length);
  });

  it("MODELOS_AISLAMIENTO_MANUAL no debe tener nombres duplicados", () => {
    expect(new Set(listaManual).size).toBe(listaManual.length);
  });
});
