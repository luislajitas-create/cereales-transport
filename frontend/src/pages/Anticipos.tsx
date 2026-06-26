import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Anticipos() {
  const [anticipos, setAnticipos] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [choferes, setChoferes] = useState<any[]>([]);
  const [tiposGasto, setTiposGasto] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [nuevo, setNuevo] = useState({
    transportistaId: "", choferId: "", tipoGastoId: "", fecha: new Date().toISOString().slice(0, 10), importe: "", observaciones: "",
  });

  function cargar() {
    api.get("/anticipos").then((res) => setAnticipos(res.data));
  }

  useEffect(() => {
    cargar();
    api.get("/transportistas").then((res) => setTransportistas(res.data));
    api.get("/tipos-gasto").then((res) => setTiposGasto(res.data));
  }, []);

  useEffect(() => {
    if (!nuevo.transportistaId) { setChoferes([]); return; }
    api.get("/choferes", { params: { transportistaId: nuevo.transportistaId } }).then((res) => setChoferes(res.data));
  }, [nuevo.transportistaId]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/anticipos", { ...nuevo, importe: Number(nuevo.importe) });
      setNuevo({ ...nuevo, tipoGastoId: "", importe: "", observaciones: "" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo registrar el anticipo/gasto");
    }
  }

  async function anular(id: string) {
    const motivo = window.prompt("Motivo de anulación:");
    if (!motivo) return;
    try {
      await api.post(`/anticipos/${id}/anular`, { motivo });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo anular");
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Anticipos y Gastos</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={crear}>
        <div className="section-title">Registrar anticipo / gasto</div>
        <div className="form-grid">
          <div className="field">
            <label>Transportista</label>
            <select value={nuevo.transportistaId} onChange={(e) => setNuevo({ ...nuevo, transportistaId: e.target.value })} required>
              <option value="">Seleccionar...</option>
              {transportistas.map((t) => <option key={t.id} value={t.id}>{t.razonSocial}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Chofer</label>
            <select value={nuevo.choferId} onChange={(e) => setNuevo({ ...nuevo, choferId: e.target.value })} required disabled={!nuevo.transportistaId}>
              <option value="">Seleccionar...</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tipo de gasto</label>
            <select value={nuevo.tipoGastoId} onChange={(e) => setNuevo({ ...nuevo, tipoGastoId: e.target.value })} required>
              <option value="">Seleccionar...</option>
              {tiposGasto.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} required />
          </div>
          <div className="field">
            <label>Importe</label>
            <input type="number" step="0.01" value={nuevo.importe} onChange={(e) => setNuevo({ ...nuevo, importe: e.target.value })} required />
          </div>
          <div className="field">
            <label>Observaciones</label>
            <input value={nuevo.observaciones} onChange={(e) => setNuevo({ ...nuevo, observaciones: e.target.value })} />
          </div>
        </div>
        <div className="actions-row"><button className="btn" type="submit">Registrar</button></div>
      </form>

      <table>
        <thead>
          <tr><th>Fecha</th><th>Transportista</th><th>Chofer</th><th>Tipo</th><th>Importe</th><th>Liquidado</th><th>Anulado</th><th></th></tr>
        </thead>
        <tbody>
          {anticipos.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.fecha).toLocaleDateString()}</td>
              <td>{a.transportista?.razonSocial}</td>
              <td>{a.chofer?.nombre}</td>
              <td>{a.tipoGasto?.nombre}</td>
              <td>{fmtMoney(a.importe)}</td>
              <td>{a.liquidado ? "Sí" : "No"}</td>
              <td>{a.anulado ? `Sí (${a.anuladoMotivo})` : "No"}</td>
              <td>
                {!a.liquidado && !a.anulado && (
                  <button className="btn danger" onClick={() => anular(a.id)}>Anular</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
