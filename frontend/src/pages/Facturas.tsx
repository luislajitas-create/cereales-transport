import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { useAsyncAction } from "../hooks/useAsyncAction";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Facturas() {
  const confirm = useConfirm();
  const { busy, error, success, run } = useAsyncAction();
  const [facturas, setFacturas] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<any>(null);
  const [cobranza, setCobranza] = useState({ fecha: new Date().toISOString().slice(0, 10), importe: "", medioPago: "" });

  const [form, setForm] = useState({ clienteId: "", numero: "", fecha: new Date().toISOString().slice(0, 10), vencimiento: "" });
  const [viajesSel, setViajesSel] = useState<Set<string>>(new Set());

  function cargar() {
    api.get("/facturas").then((res) => setFacturas(res.data));
  }
  useEffect(() => {
    cargar();
    api.get("/clientes").then((res) => setClientes(res.data));
  }, []);

  async function buscarPendientes() {
    if (!form.clienteId) return;
    const { data } = await api.get("/viajes/pendientes-facturar", { params: { clienteId: form.clienteId } });
    setPendientes(data);
    setViajesSel(new Set());
  }

  function toggle(id: string) {
    const next = new Set(viajesSel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setViajesSel(next);
  }

  function crearFactura() {
    run(
      async () => {
        const { data } = await api.post("/facturas", { ...form, viajeIds: Array.from(viajesSel) });
        setPendientes([]);
        setViajesSel(new Set());
        setForm({ ...form, numero: "", vencimiento: "" });
        cargar();
        return data;
      },
      {
        successMessage: (data: any) => `Factura ${data.numero} creada por ${fmtMoney(data.importe)}.`,
        errorMessage: "No se pudo crear la factura",
      },
    );
  }

  async function verDetalle(id: string) {
    const { data } = await api.get(`/facturas/${id}`);
    setDetalle(data);
  }

  async function registrarCobranza() {
    if (!detalle) return;
    const importeCobranza = Number(cobranza.importe) || 0;
    const ok = await confirm({
      title: "Registrar cobranza",
      message: `¿Registrar una cobranza de ${fmtMoney(importeCobranza)}${cobranza.medioPago ? ` por ${cobranza.medioPago}` : ""} para la factura ${detalle.numero}?`,
      confirmLabel: "Registrar cobranza",
    });
    if (!ok.confirmed) return;
    run(
      async () => {
        await api.post(`/facturas/${detalle.id}/cobranzas`, { ...cobranza, importe: importeCobranza });
        setCobranza({ fecha: new Date().toISOString().slice(0, 10), importe: "", medioPago: "" });
        await verDetalle(detalle.id);
        cargar();
      },
      {
        successMessage: `Cobranza registrada por ${fmtMoney(importeCobranza)}.`,
        errorMessage: "No se pudo registrar la cobranza",
      },
    );
  }

  async function anularFactura(id: string) {
    if (!detalle) return;
    const ok = await confirm({
      title: "Anular factura",
      message: `¿Anular la factura ${detalle.numero} por ${fmtMoney(detalle.importe)}? Se revertirán ${detalle.viajes.length} viaje(s) a pendiente de facturar.`,
      confirmLabel: "Anular factura",
    });
    if (!ok.confirmed) return;
    const numeroAnulada = detalle.numero;
    run(
      async () => {
        await api.post(`/facturas/${id}/anular`, {});
        cargar();
        setDetalle(null);
      },
      {
        successMessage: `Factura ${numeroAnulada} anulada.`,
        errorMessage: "No se pudo anular la factura",
      },
    );
  }

  const totalSel = pendientes.filter((v) => viajesSel.has(v.id)).reduce((acc, v) => acc + v.importeTotal, 0);

  return (
    <div>
      <div className="page-header"><h1>Facturación</h1></div>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <div className="section-title">Nueva factura</div>
        <div className="form-grid">
          <div className="field">
            <label>Cliente</label>
            <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
              <option value="">Seleccionar...</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Número de factura</label>
            <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <div className="field">
            <label>Vencimiento</label>
            <input type="date" value={form.vencimiento} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} />
          </div>
        </div>
        <div className="actions-row"><button className="btn secondary" onClick={buscarPendientes}>Buscar viajes pendientes de facturar</button></div>

        {pendientes.length > 0 && (
          <>
            <table>
              <thead><tr><th></th><th>N°</th><th>Fecha</th><th>CTG</th><th>Cereal</th><th>Tn</th><th>Importe</th></tr></thead>
              <tbody>
                {pendientes.map((v) => (
                  <tr key={v.id}>
                    <td><input type="checkbox" checked={viajesSel.has(v.id)} onChange={() => toggle(v.id)} /></td>
                    <td>{v.numeroViaje}</td>
                    <td>{new Date(v.fecha).toLocaleDateString()}</td>
                    <td>{v.ctg}</td>
                    <td>{v.cereal?.nombre}</td>
                    <td>{v.toneladas}</td>
                    <td>{fmtMoney(v.importeTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">Total seleccionado: {fmtMoney(totalSel)}</p>
            <div className="actions-row">
              <button className="btn" disabled={viajesSel.size === 0 || !form.numero || !form.vencimiento || busy} onClick={crearFactura}>
                {busy ? "Creando..." : "Crear factura"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">Facturas emitidas</div>
        <table>
          <thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Vencimiento</th><th>Importe</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {facturas.map((f) => (
              <tr key={f.id}>
                <td>{f.numero}</td>
                <td>{f.cliente?.razonSocial}</td>
                <td>{new Date(f.fecha).toLocaleDateString()}</td>
                <td>{new Date(f.vencimiento).toLocaleDateString()}</td>
                <td>{fmtMoney(f.importe)}</td>
                <td><span className={`badge ${f.estado}`}>{f.estado}</span></td>
                <td><button className="btn secondary" onClick={() => verDetalle(f.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="card">
          <div className="page-header">
            <h1>Factura {detalle.numero}</h1>
            <span className={`badge ${detalle.estado}`}>{detalle.estado}</span>
          </div>
          <table>
            <thead><tr><th>Viaje</th><th>Importe</th></tr></thead>
            <tbody>
              {detalle.viajes.map((fv: any) => (
                <tr key={fv.id}><td>N° {fv.viaje.numeroViaje} ({fv.viaje.cereal?.nombre})</td><td>{fmtMoney(fv.importeViaje)}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="section-title">Cobranzas</div>
          <table>
            <thead><tr><th>Fecha</th><th>Importe</th><th>Medio de pago</th></tr></thead>
            <tbody>
              {detalle.cobranzas.map((c: any) => (
                <tr key={c.id}><td>{new Date(c.fecha).toLocaleDateString()}</td><td>{fmtMoney(c.importe)}</td><td>{c.medioPago || "—"}</td></tr>
              ))}
            </tbody>
          </table>

          {detalle.estado !== "ANULADO" && detalle.estado !== "COBRADO_TOTAL" && (
            <div className="filters" style={{ marginTop: "0.8rem" }}>
              <input type="date" value={cobranza.fecha} onChange={(e) => setCobranza({ ...cobranza, fecha: e.target.value })} />
              <input type="number" placeholder="Importe" value={cobranza.importe} onChange={(e) => setCobranza({ ...cobranza, importe: e.target.value })} />
              <input placeholder="Medio de pago" value={cobranza.medioPago} onChange={(e) => setCobranza({ ...cobranza, medioPago: e.target.value })} />
              <button className="btn" disabled={busy} onClick={registrarCobranza}>Registrar cobranza</button>
            </div>
          )}

          {detalle.cobranzas.length === 0 && detalle.estado !== "ANULADO" && (
            <div className="actions-row"><button className="btn danger" disabled={busy} onClick={() => anularFactura(detalle.id)}>Anular factura</button></div>
          )}
        </div>
      )}
    </div>
  );
}
