import {
  sanitizarParaAuditoria,
  calcularCamposCambiados,
  subconjunto,
  marcarOrigenImportacionCsv,
  registrarAuditoria,
  ORIGEN_IMPORTACION_CSV,
} from "./auditoria";

// CAT-4: única función central de sanitización antes de persistir un evento de AuditLog (sección
// 5 del bloque) — estas pruebas cubren la política de minimización de datos personales acordada:
// DNI/CUIL/teléfono/licenciaNumero se enmascaran conservando como máximo los últimos 4
// caracteres; CUIT/patente quedan legibles (identificadores comerciales); cualquier campo que
// matchee un patrón de secreto se oculta por completo; todo aplica recursivamente.
describe("sanitizarParaAuditoria", () => {
  it("enmascara dni/cuil/telefono/licenciaNumero conservando como máximo los últimos 4 caracteres", () => {
    const resultado = sanitizarParaAuditoria({
      dni: "30123456",
      cuil: "20301234564",
      telefono: "+54 9 11 1234-5678",
      licenciaNumero: "B1234567",
    });
    expect(resultado).toEqual({
      dni: "****3456",
      cuil: "****4564",
      telefono: "****5678",
      licenciaNumero: "****4567",
    });
  });

  it("no enmascara cuit ni patente — son identificadores comerciales, no personales", () => {
    const resultado = sanitizarParaAuditoria({ cuit: "30111111111", patente: "AB123CD" });
    expect(resultado).toEqual({ cuit: "30111111111", patente: "AB123CD" });
  });

  it("un valor más corto que 4 caracteres se enmascara igual, sin desbordar", () => {
    expect(sanitizarParaAuditoria({ dni: "12" })).toEqual({ dni: "****12" });
  });

  it("null/undefined en un campo enmascarable se preservan tal cual (no se convierten en la cadena '****')", () => {
    expect(sanitizarParaAuditoria({ dni: null, telefono: undefined })).toEqual({ dni: null, telefono: undefined });
  });

  it("la comparación de campos enmascarables no distingue mayúsculas/minúsculas en la clave", () => {
    expect(sanitizarParaAuditoria({ DNI: "30123456" })).toEqual({ DNI: "****3456" });
  });

  it("cualquier campo cuyo nombre matchee un patrón de secreto se oculta por completo, nunca se enmascara parcialmente", () => {
    const resultado = sanitizarParaAuditoria({ password: "hunter2", token: "abc123", apiKey: "sk-live-xyz" });
    expect(resultado).toEqual({ password: "[oculto]", token: "[oculto]", apiKey: "[oculto]" });
  });

  it("aplica recursivamente a objetos anidados", () => {
    const resultado = sanitizarParaAuditoria({ chofer: { nombre: "Juan", dni: "30123456" } });
    expect(resultado).toEqual({ chofer: { nombre: "Juan", dni: "****3456" } });
  });

  it("aplica recursivamente a arrays de objetos", () => {
    const resultado = sanitizarParaAuditoria({ choferes: [{ dni: "30123456" }, { dni: "40987654" }] });
    expect(resultado).toEqual({ choferes: [{ dni: "****3456" }, { dni: "****7654" }] });
  });

  it("la clave reservada de origen de importación nunca se enmascara ni se oculta", () => {
    const resultado = sanitizarParaAuditoria(marcarOrigenImportacionCsv({ razonSocial: "X" }));
    expect(resultado).toEqual({ razonSocial: "X", _origen: ORIGEN_IMPORTACION_CSV });
  });

  it("campos no sensibles (razonSocial, activo, comisionPct) se preservan sin cambios", () => {
    expect(sanitizarParaAuditoria({ razonSocial: "Cliente X", activo: true, comisionPct: 5 })).toEqual({
      razonSocial: "Cliente X",
      activo: true,
      comisionPct: 5,
    });
  });

  it("preserva instancias de Date sin convertirlas en objetos planos", () => {
    const fecha = new Date("2027-03-01");
    const resultado = sanitizarParaAuditoria({ vencimientoRto: fecha });
    expect(resultado.vencimientoRto).toBe(fecha);
  });
});

describe("calcularCamposCambiados", () => {
  it("no reporta ningún campo cuando los dos snapshots son idénticos (PATCH idempotente)", () => {
    expect(calcularCamposCambiados({ razonSocial: "X", activo: true }, { razonSocial: "X", activo: true })).toEqual([]);
  });

  it("reporta solo las claves cuyo valor realmente cambió", () => {
    expect(
      calcularCamposCambiados({ razonSocial: "X", activo: true, cuit: "1" }, { razonSocial: "Y", activo: true, cuit: "1" }),
    ).toEqual(["razonSocial"]);
  });

  it("compara fechas por su valor real (ISO), no por identidad de objeto", () => {
    const antes = { vencimientoRto: new Date("2027-03-01") };
    const despues = { vencimientoRto: new Date("2027-03-01") };
    expect(calcularCamposCambiados(antes, despues)).toEqual([]);
  });

  it("detecta un cambio real de fecha", () => {
    const antes = { vencimientoRto: new Date("2027-03-01") };
    const despues = { vencimientoRto: new Date("2027-04-01") };
    expect(calcularCamposCambiados(antes, despues)).toEqual(["vencimientoRto"]);
  });

  it("null y undefined se tratan como equivalentes (ninguno de los dos es un valor real)", () => {
    expect(calcularCamposCambiados({ dni: null }, { dni: undefined })).toEqual([]);
  });

  it("detecta un cambio de false a true en un campo booleano (activo)", () => {
    expect(calcularCamposCambiados({ activo: false }, { activo: true })).toEqual(["activo"]);
  });
});

describe("subconjunto", () => {
  it("devuelve solo las claves pedidas, en su valor actual", () => {
    expect(subconjunto({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignora claves pedidas que no existen en el objeto de origen", () => {
    expect(subconjunto({ a: 1 }, ["a", "z"])).toEqual({ a: 1 });
  });
});

describe("marcarOrigenImportacionCsv", () => {
  it("agrega la clave reservada de origen sin tocar el resto del snapshot", () => {
    expect(marcarOrigenImportacionCsv({ razonSocial: "X", activo: true })).toEqual({
      razonSocial: "X",
      activo: true,
      _origen: "importacion_csv",
    });
  });
});

describe("registrarAuditoria", () => {
  function crearTx() {
    return { auditLog: { create: jest.fn().mockResolvedValue(undefined) } };
  }

  it("escribe usuarioId/entidad/entidadId/accion exactos, sin agregar ni omitir campos técnicos", async () => {
    const tx = crearTx();
    await registrarAuditoria(tx as any, {
      usuarioId: "user-1",
      entidad: "Cliente",
      entidadId: "cli-1",
      accion: "cliente_creado",
      datosNuevos: { razonSocial: "X" },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        usuarioId: "user-1",
        entidad: "Cliente",
        entidadId: "cli-1",
        accion: "cliente_creado",
        datosAnteriores: undefined,
        datosNuevos: { razonSocial: "X" },
      },
    });
  });

  it("sanitiza datosAnteriores/datosNuevos antes de persistirlos (nunca guarda el DNI/CUIL/teléfono en texto completo)", async () => {
    const tx = crearTx();
    await registrarAuditoria(tx as any, {
      usuarioId: "user-1",
      entidad: "Chofer",
      entidadId: "chof-1",
      accion: "chofer_editado",
      datosAnteriores: { dni: "30123456" },
      datosNuevos: { dni: "30123456", telefono: "+54 9 11 1234-5678" },
    });

    const { datosAnteriores, datosNuevos } = tx.auditLog.create.mock.calls[0][0].data;
    expect(datosAnteriores).toEqual({ dni: "****3456" });
    expect(datosNuevos).toEqual({ dni: "****3456", telefono: "****5678" });
  });

  it("nunca incluye organizacionId en el registro escrito — la extensión de aislamiento lo inyecta sola", async () => {
    const tx = crearTx();
    await registrarAuditoria(tx as any, {
      usuarioId: "user-1",
      entidad: "Cliente",
      entidadId: "cli-1",
      accion: "cliente_creado",
      datosNuevos: { razonSocial: "X" },
    });

    const dataEscrita = tx.auditLog.create.mock.calls[0][0].data;
    expect("organizacionId" in dataEscrita).toBe(false);
  });

  it("propaga el error si auditLog.create falla (para que $transaction revierta todo)", async () => {
    const tx = crearTx();
    (tx.auditLog.create as jest.Mock).mockRejectedValueOnce(new Error("fallo simulado"));

    await expect(
      registrarAuditoria(tx as any, { usuarioId: "user-1", entidad: "Cliente", entidadId: "cli-1", accion: "cliente_creado" }),
    ).rejects.toThrow("fallo simulado");
  });
});
