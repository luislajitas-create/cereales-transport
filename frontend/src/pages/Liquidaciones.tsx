import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { useAsyncAction } from "../hooks/useAsyncAction";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Liquidaciones() {
  const confirm = useConfirm();
  const { busy, error, success, setError, run } = useAsyncAction();
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [choferes, setChoferes] = useState<any[]>([]);
  const [detalle, setDetalle] = useState<any>(null);
  const [descargando, setDescargando] = useState<string>("");

  const [form, setForm] = useState({
    tipo: "TRANSPORTISTA", transportistaId: "", choferId: "", periodoDesde: "", periodoHasta: "", comisionPct: "0",
  });
  const [candidatos, setCandidatos] = useState<{ viajes: any[]; anticipos: any[] } | null>(null);
  const [viajesSel, setViajesSel] = useState<Set<string>>(new Set());
  const [anticiposSel, setAnticiposSel] = useState<Set<string>>(new Set());

  function cargar() {
    api.get("/liquidaciones").then((res) => setLiquidaciones(res.data));
  }
  useEffect(() => {
    cargar();
    api.get("/transportistas").then((res) => setTransportistas(res.data));
  }, []);
  useEffect(() => {
    if (form.tipo === "CHOFER" && form.transportistaId) {
      api.get("/choferes", { params: { transportistaId: form.transportistaId } }).then((res) => setChoferes(res.data));
    }
  }, [form.tipo, form.transportistaId]);

  async function buscarCandidatos() {
    setError("");
    const params: any = { tipo: form.tipo, desde: form.periodoDesde, hasta: form.periodoHasta };
    if (form.tipo === "TRANSPORTISTA") params.transportistaId = form.transportistaId;
    else params.choferId = form.choferId;
    try {
      const { data } = await api.get("/liquidaciones/candidatos", { params });
      setCandidatos(data);
      setViajesSel(new Set());
      setAnticiposSel(new Set());
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron buscar los candidatos");
    }
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSet(next);
  }

  function crearLiquidacion() {
    run(
      async () => {
        const { data } = await api.post("/liquidaciones", {
          ...form,
          comisionPct: Number(form.comisionPct),
          viajeIds: Array.from(viajesSel),
          anticipoIds: Array.from(anticiposSel),
        });
        setCandidatos(null);
        cargar();
        await verDetalle(data.id);
        return data;
      },
      {
        successMessage: (data: any) => `Liquidación N° ${data.numero} creada en borrador.`,
        errorMessage: "No se pudo crear la liquidación",
      },
    );
  }

  async function verDetalle(id: string) {
    const { data } = await api.get(`/liquidaciones/${id}`);
    setDetalle(data);
  }

  async function confirmarLiquidacion() {
    if (!detalle) return;
    const ok = await confirm({
      title: "Confirmar liquidación",
      message: `¿Confirmar la liquidación N° ${detalle.numero}? Podrá marcarse como pagada una vez confirmada.`,
      confirmLabel: "Confirmar liquidación",
    });
    if (!ok.confirmed) return;
    run(
      async () => {
        await api.post(`/liquidaciones/${detalle.id}/confirmar`, {});
        cargar();
        await verDetalle(detalle.id);
      },
      {
        successMessage: `Liquidación N° ${detalle.numero} confirmada.`,
        errorMessage: "No se pudo confirmar la liquidación.",
      },
    );
  }

  async function pagarLiquidacion() {
    if (!detalle) return;
    const contraparte = detalle.transportista?.razonSocial || detalle.chofer?.nombre || "-";
    const ok = await confirm({
      title: "Marcar como pagada",
      message: `¿Marcar como pagada la liquidación N° ${detalle.numero} por ${fmtMoney(detalle.netoPagar)} a ${contraparte}? Esta acción no se puede deshacer.`,
      severity: "high",
      requireTypedValue: String(detalle.numero),
      typedValueLabel: `Escribí "${detalle.numero}" para confirmar`,
      confirmLabel: "Marcar como pagada",
    });
    if (!ok.confirmed) return;
    run(
      async () => {
        await api.post(`/liquidaciones/${detalle.id}/pagar`, {});
        cargar();
        await verDetalle(detalle.id);
      },
      {
        successMessage: `Liquidación N° ${detalle.numero} pagada — ${fmtMoney(detalle.netoPagar)}.`,
        errorMessage: "No se pudo marcar la liquidación como pagada.",
      },
    );
  }

  async function anularLiquidacion() {
    if (!detalle) return;
    const efectoAnticipos = detalle.movimientos.length > 0 ? ` y ${detalle.movimientos.length} anticipo(s)/gasto(s) a no liquidado` : "";
    const ok = await confirm({
      title: "Anular liquidación",
      message: `¿Anular la liquidación N° ${detalle.numero}? Se revertirán ${detalle.viajes.length} viaje(s) a pendiente de liquidar${efectoAnticipos}.`,
      confirmLabel: "Anular liquidación",
    });
    if (!ok.confirmed) return;
    run(
      async () => {
        await api.post(`/liquidaciones/${detalle.id}/anular`, {});
        cargar();
        await verDetalle(detalle.id);
      },
      {
        successMessage: `Liquidación N° ${detalle.numero} anulada.`,
        errorMessage: "No se pudo anular la liquidación.",
      },
    );
  }

  async function descargar(id: string, numero: string | number, tipo: "excel" | "pdf") {
    setError("");
    setDescargando(`${id}-${tipo}`);
    try {
      const { data } = await api.get(`/liquidaciones/${id}/${tipo}`, { responseType: "blob" });
      const ext = tipo === "excel" ? "xlsx" : "pdf";
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `liquidacion-${numero}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("No se pudo descargar el archivo");
    } finally {
      setDescargando("");
    }
  }

  const totalViajesSel = candidatos?.viajes.filter((v) => viajesSel.has(v.id)).reduce((acc, v) => acc + v.importeTotal, 0) || 0;
  const totalAnticiposSel = candidatos?.anticipos.filter((a) => anticiposSel.has(a.id)).reduce((acc, a) => acc + a.importe, 0) || 0;

  return (
    <div>
      <div className="page-header"><h1>Liquidaciones</h1></div>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <div className="section-title">Nueva liquidación</div>
        <div className="form-grid">
          <div className="field">
            <label>Tipo</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, choferId: "" })}>
              <option value="TRANSPORTISTA">Por transportista</option>
              <option value="CHOFER">Por chofer</option>
            </select>
          </div>
          <div className="field">
            <label>Transportista</label>
            <select value={form.transportistaId} onChange={(e) => setForm({ ...form, transportistaId: e.target.value })} required>
              <option value="">Seleccionar...</option>
              {transportistas.map((t) => <option key={t.id} value={t.id}>{t.razonSocial}</option>)}
            </select>
          </div>
          {form.tipo === "CHOFER" && (
            <div className="field">
              <label>Chofer</label>
              <select
                value={form.choferId}
                onChange={(e) => {
                  const choferId = e.target.value;
                  const chofer = choferes.find((c) => c.id === choferId);
                  setForm({ ...form, choferId, comisionPct: chofer ? String(chofer.comisionPct) : form.comisionPct });
                }}
                required
              >
                <option value="">Seleccionar...</option>
                {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Período desde</label>
            <input type="date" value={form.periodoDesde} onChange={(e) => setForm({ ...form, periodoDesde: e.target.value })} required />
          </div>
          <div className="field">
            <label>Período hasta</label>
            <input type="date" value={form.periodoHasta} onChange={(e) => setForm({ ...form, periodoHasta: e.target.value })} required />
          </div>
          <div className="field">
            <label>Comisión (%)</label>
            <input type="number" step="0.01" value={form.comisionPct} onChange={(e) => setForm({ ...form, comisionPct: e.target.value })} />
            {form.tipo === "CHOFER" && form.choferId && (
              <span className="muted" style={{ fontSize: "0.8em" }}>
                Precompletado desde el chofer — se puede modificar como excepción.
              </span>
            )}
          </div>
        </div>
        <div className="actions-row"><button className="btn secondary" onClick={buscarCandidatos}>Buscar viajes y gastos pendientes</button></div>

        {candidatos && (
          <>
            <div className="section-title">Viajes pendientes de liquidar ({candidatos.viajes.length})</div>
            <table>
              <thead><tr><th></th><th>N°</th><th>Fecha</th><th>CTG</th><th>Cereal</th><th>Tn</th><th>Importe</th></tr></thead>
              <tbody>
                {candidatos.viajes.map((v) => (
                  <tr key={v.id}>
                    <td><input type="checkbox" checked={viajesSel.has(v.id)} onChange={() => toggle(viajesSel, setViajesSel, v.id)} /></td>
                    <td>{v.numeroViaje}</td>
                    <td>{new Date(v.fecha).toLocaleDateString()}</td>
                    <td>{v.ctg}</td>
                    <td>{v.cereal?.nombre}</td>
                    <td>{v.toneladas}</td>
                    <td>{fmtMoney(v.importeTotal)}</td>
                  </tr>
                ))}
                {candidatos.viajes.length === 0 && <tr><td colSpan={7} className="muted">Sin viajes pendientes en el período.</td></tr>}
              </tbody>
            </table>

            <div className="section-title">Anticipos / gastos pendientes ({candidatos.anticipos.length})</div>
            <table>
              <thead><tr><th></th><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Observación</th></tr></thead>
              <tbody>
                {candidatos.anticipos.map((a) => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={anticiposSel.has(a.id)} onChange={() => toggle(anticiposSel, setAnticiposSel, a.id)} /></td>
                    <td>{new Date(a.fecha).toLocaleDateString()}</td>
                    <td>{a.tipoGasto?.nombre}</td>
                    <td>{fmtMoney(a.importe)}</td>
                    <td>{a.observaciones || "—"}</td>
                  </tr>
                ))}
                {candidatos.anticipos.length === 0 && <tr><td colSpan={5} className="muted">Sin anticipos/gastos pendientes.</td></tr>}
              </tbody>
            </table>

            <p className="muted">
              Bruto seleccionado: {fmtMoney(totalViajesSel)} · Anticipos/gastos seleccionados: {fmtMoney(totalAnticiposSel)} ·
              Comisión: {form.comisionPct}%
            </p>
            <div className="actions-row">
              <button className="btn" disabled={viajesSel.size === 0 || busy} onClick={crearLiquidacion}>
                {busy ? "Creando..." : "Crear liquidación (borrador)"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">Liquidaciones</div>
        <table>
          <thead><tr><th>N°</th><th>Tipo</th><th>Transportista / Chofer</th><th>Período</th><th>Neto a pagar</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {liquidaciones.map((l) => (
              <tr key={l.id}>
                <td>{l.numero}</td>
                <td>{l.tipo}</td>
                <td>{l.transportista?.razonSocial || l.chofer?.nombre}</td>
                <td>{new Date(l.periodoDesde).toLocaleDateString()} - {new Date(l.periodoHasta).toLocaleDateString()}</td>
                <td>{fmtMoney(l.netoPagar)}</td>
                <td><span className={`badge ${l.estado}`}>{l.estado}</span></td>
                <td><button className="btn secondary" onClick={() => verDetalle(l.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="card">
          <div className="page-header">
            <h1>Liquidación N° {detalle.numero}</h1>
            <span className={`badge ${detalle.estado}`}>{detalle.estado}</span>
          </div>
          <p>
            <strong>Total bruto:</strong> {fmtMoney(detalle.totalBruto)} · <strong>Anticipos:</strong> {fmtMoney(detalle.totalAnticipos)} ·{" "}
            <strong>Descuentos:</strong> {fmtMoney(detalle.totalDescuentos)} · <strong>Neto a pagar:</strong> {fmtMoney(detalle.netoPagar)}
          </p>
          <table>
            <thead><tr><th>Viaje</th><th>Subtotal</th><th>Comisión</th><th>Total</th></tr></thead>
            <tbody>
              {detalle.viajes.map((lv: any) => (
                <tr key={lv.id}>
                  <td>N° {lv.viaje.numeroViaje} ({lv.viaje.cereal?.nombre})</td>
                  <td>{fmtMoney(lv.subtotal)}</td>
                  <td>{fmtMoney(lv.comisionMonto)} ({lv.comisionPct}%)</td>
                  <td>{fmtMoney(lv.totalViaje)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detalle.movimientos.length > 0 && (
            <>
              <div className="section-title">Anticipos / gastos descontados</div>
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th></tr></thead>
                <tbody>
                  {detalle.movimientos.map((m: any) => (
                    <tr key={m.id}><td>{new Date(m.fecha).toLocaleDateString()}</td><td>{m.tipoGasto?.nombre}</td><td>{fmtMoney(m.importe)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="actions-row">
            <button className="btn secondary" disabled={descargando === `${detalle.id}-excel`} onClick={() => descargar(detalle.id, detalle.numero, "excel")}>
              {descargando === `${detalle.id}-excel` ? "Descargando..." : "Descargar Excel"}
            </button>
            <button className="btn secondary" disabled={descargando === `${detalle.id}-pdf`} onClick={() => descargar(detalle.id, detalle.numero, "pdf")}>
              {descargando === `${detalle.id}-pdf` ? "Descargando..." : "Descargar PDF"}
            </button>
            {detalle.estado === "BORRADOR" && <button className="btn success" disabled={busy} onClick={confirmarLiquidacion}>Confirmar</button>}
            {detalle.estado === "CONFIRMADA" && <button className="btn success" disabled={busy} onClick={pagarLiquidacion}>Marcar como pagada</button>}
            {detalle.estado !== "PAGADA" && <button className="btn danger" disabled={busy} onClick={anularLiquidacion}>Anular</button>}
          </div>
        </div>
      )}
    </div>
  );
}
