import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Clientes() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState({ razonSocial: "", cuit: "", condicionesComerciales: "" });
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cuentaCorriente, setCuentaCorriente] = useState<any>(null);
  // CAT-1: importación masiva por CSV — camino adicional al alta individual de arriba, no un
  // reemplazo.
  const [archivoImportar, setArchivoImportar] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] = useState<{ total: number; creados: number; rechazados: number; detalle: { fila: number; ok: boolean; mensaje: string }[] } | null>(null);

  function cargar() {
    api.get("/clientes").then((res) => setClientes(res.data));
  }
  useEffect(() => { cargar(); }, []);

  async function descargarPlantillaImportacion() {
    const { data } = await api.get("/clientes/importar/plantilla", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-clientes.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function importarCsv() {
    if (!archivoImportar) return;
    setImportando(true);
    setError("");
    setResultadoImportacion(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportar);
      const { data } = await api.post("/clientes/importar", formData);
      setResultadoImportacion(data);
      setArchivoImportar(null);
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo importar el archivo");
    } finally {
      setImportando(false);
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/clientes", nuevo);
      setNuevo({ razonSocial: "", cuit: "", condicionesComerciales: "" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo crear el cliente");
    }
  }

  async function verCuentaCorriente(id: string) {
    setSeleccionado(id);
    const { data } = await api.get(`/clientes/${id}/cuenta-corriente`);
    setCuentaCorriente(data);
  }

  return (
    <div>
      <div className="page-header"><h1>Clientes</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={crear}>
        <div className="section-title">Nuevo cliente</div>
        <div className="form-grid">
          <div className="field">
            <label>Razón social</label>
            <input value={nuevo.razonSocial} onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })} required />
          </div>
          <div className="field">
            <label>CUIT</label>
            <input value={nuevo.cuit} onChange={(e) => setNuevo({ ...nuevo, cuit: e.target.value })} required />
          </div>
          <div className="field">
            <label>Condiciones comerciales</label>
            <input value={nuevo.condicionesComerciales} onChange={(e) => setNuevo({ ...nuevo, condicionesComerciales: e.target.value })} />
          </div>
        </div>
        <div className="actions-row"><button className="btn" type="submit">Agregar</button></div>
      </form>

      <div className="card">
        <div className="section-title">Importar desde CSV</div>
        <p className="muted">Cargá varios clientes a la vez. Descargá la plantilla para saber qué columnas usar.</p>
        <div className="actions-row">
          <button className="btn secondary" type="button" onClick={descargarPlantillaImportacion}>Descargar plantilla</button>
          <input type="file" accept=".csv" onChange={(e) => setArchivoImportar(e.target.files?.[0] || null)} />
          <button className="btn" type="button" disabled={!archivoImportar || importando} onClick={importarCsv}>
            {importando ? "Importando..." : "Importar"}
          </button>
        </div>
        {resultadoImportacion && (
          <div className={resultadoImportacion.rechazados > 0 ? "warning-banner" : "success-banner"}>
            <strong>{resultadoImportacion.creados} de {resultadoImportacion.total} clientes creados</strong>
            {resultadoImportacion.rechazados > 0 && ` — ${resultadoImportacion.rechazados} rechazados:`}
            {resultadoImportacion.rechazados > 0 && (
              <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
                {resultadoImportacion.detalle.filter((d) => !d.ok).map((d) => (
                  <li key={d.fila}>Fila {d.fila}: {d.mensaje}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <table>
        <thead><tr><th>Razón social</th><th>CUIT</th><th>Condiciones</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.id}>
              <td>{c.razonSocial}</td>
              <td>{c.cuit}</td>
              <td>{c.condicionesComerciales || "—"}</td>
              <td>{c.activo ? "Sí" : "No"}</td>
              <td><button className="btn secondary" onClick={() => verCuentaCorriente(c.id)}>Cuenta corriente</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {seleccionado && cuentaCorriente && (
        <div className="card">
          <div className="section-title">Cuenta corriente</div>
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead>
            <tbody>
              {cuentaCorriente.movimientos.map((m: any, i: number) => (
                <tr key={i}>
                  <td>{new Date(m.fecha).toLocaleDateString()}</td>
                  <td>{m.concepto}</td>
                  <td>{m.debe ? fmtMoney(m.debe) : "—"}</td>
                  <td>{m.haber ? fmtMoney(m.haber) : "—"}</td>
                  <td>{fmtMoney(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-table"><td colSpan={4}>Saldo actual</td><td>{fmtMoney(cuentaCorriente.saldoActual)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
