import { useEffect, useState } from "react";
import { api } from "../api/client";

// Bloque 7.3.2 — esta pantalla solo presenta lo que el backend ya calculó.
// No debe contener ninguna operación aritmética sobre importes/porcentajes/días
// (BLOQUE7.3.2_DISENO_AGING_COBRANZAS.md, sección 6, criterio de aceptación 13) —
// fmtMoney/fmtDias son formato de presentación, no cálculo.

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDias(n: number | null) {
  return n === null || n === undefined ? "—" : `${n} días`;
}

const BUCKETS = ["0-30", "31-60", "61-90", "+90"] as const;

export default function Aging() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ clienteId: "", desde: "", hasta: "" });
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [expandidoCliente, setExpandidoCliente] = useState<string | null>(null);

  useEffect(() => {
    api.get("/clientes").then((res) => setClientes(res.data));
  }, []);

  async function buscar() {
    setError("");
    setCargando(true);
    try {
      const params: any = {};
      if (filtros.clienteId) params.clienteId = filtros.clienteId;
      if (filtros.desde) params.desde = filtros.desde;
      if (filtros.hasta) params.hasta = filtros.hasta;
      const { data: res } = await api.get("/inteligencia/cobranzas/aging", { params });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo obtener el aging de cobranzas");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="page-header"><h1>Aging de Cobranzas</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="section-title">Filtros</div>
        <div className="filters">
          <select value={filtros.clienteId} onChange={(e) => setFiltros({ ...filtros, clienteId: e.target.value })}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
          </select>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} placeholder="Desde (para DSO)" />
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} placeholder="Hasta (para DSO)" />
          <button className="btn" onClick={buscar} disabled={cargando}>{cargando ? "Calculando..." : "Buscar"}</button>
        </div>
        <p className="muted">El período solo afecta el cálculo de DSO — la cartera de aging siempre muestra el estado completo a la fecha de hoy.</p>
      </div>

      {data && (
        <>
          <div className="card">
            <div className="section-title">Totales a la fecha ({data.fechaCorte})</div>
            <table>
              <thead>
                <tr><th>Total pendiente</th><th>Vencido</th><th>Por vencer</th><th>Facturas pendientes</th><th>Facturas vencidas</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmtMoney(data.totales.totalPendiente)}</td>
                  <td className={data.totales.totalVencido > 0 ? "danger-text" : ""}>{fmtMoney(data.totales.totalVencido)}</td>
                  <td>{fmtMoney(data.totales.totalPorVencer)}</td>
                  <td>{data.totales.facturasPendientes}</td>
                  <td>{data.totales.facturasVencidas}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="section-title">Aging por antigüedad de mora</div>
            <table>
              <thead><tr><th>Bucket</th><th>Monto</th><th>Facturas</th></tr></thead>
              <tbody>
                {BUCKETS.map((b) => (
                  <tr key={b}>
                    <td>{b} días</td>
                    <td>{fmtMoney(data.aging[b].monto)}</td>
                    <td>{data.aging[b].facturas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="section-title">DSO (Días de Venta Pendientes de Cobro)</div>
            <table>
              <thead><tr><th>Indicador</th><th>Valor</th><th>Detalle</th></tr></thead>
              <tbody>
                <tr>
                  <td>DSO histórico (oficial)</td>
                  <td>{fmtDias(data.dso.historico?.dias ?? null)}</td>
                  <td className="muted">{data.dso.historico ? `${data.dso.historico.facturasConsideradas} factura(s) cobradas del todo en el período` : "Sin facturas cobradas del todo en el período"}</td>
                </tr>
                <tr>
                  <td>DSO aproximado (snapshot)</td>
                  <td>{fmtDias(data.dso.snapshotClasico.dias)}</td>
                  <td className="muted">Aproximación estándar — cartera actual {fmtMoney(data.dso.snapshotClasico.carteraActual)} / ventas del período {fmtMoney(data.dso.snapshotClasico.ventasPeriodo)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="section-title">Por cliente</div>
            <table>
              <thead><tr><th>Cliente</th><th>Pendiente</th><th>Vencido</th><th>Por vencer</th><th>Mora promedio</th><th>Facturas</th><th></th></tr></thead>
              <tbody>
                {data.porCliente.map((row: any) => (
                  <tr key={row.clienteId}>
                    <td>{row.cliente}</td>
                    <td>{fmtMoney(row.totalPendiente)}</td>
                    <td className={row.totalVencido > 0 ? "danger-text" : ""}>{fmtMoney(row.totalVencido)}</td>
                    <td>{fmtMoney(row.totalPorVencer)}</td>
                    <td>{fmtDias(Math.round(row.diasMoraPromedio))}</td>
                    <td>{row.facturas}</td>
                    <td>
                      <button className="btn secondary" onClick={() => setExpandidoCliente(expandidoCliente === row.clienteId ? null : row.clienteId)}>
                        {expandidoCliente === row.clienteId ? "Cerrar" : "Ver facturas"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.porCliente.length === 0 && <tr><td colSpan={7} className="muted">Sin cartera pendiente.</td></tr>}
              </tbody>
            </table>
            {expandidoCliente && (
              <table>
                <thead><tr><th>N°</th><th>Fecha</th><th>Vencimiento</th><th>Saldo</th><th>Mora</th><th>Estado</th></tr></thead>
                <tbody>
                  {data.detalleFacturas
                    .filter((f: any) => data.porCliente.find((c: any) => c.clienteId === expandidoCliente)?.cliente === f.cliente)
                    .map((f: any) => (
                      <tr key={f.facturaId}>
                        <td>{f.numero}</td>
                        <td>{new Date(f.fecha).toLocaleDateString("es-AR")}</td>
                        <td>{new Date(f.vencimiento).toLocaleDateString("es-AR")}</td>
                        <td>{fmtMoney(f.saldoPendiente)}</td>
                        <td>{f.vencida ? fmtDias(f.diasMora) : "—"}</td>
                        <td>{f.vencida ? f.bucket : "Por vencer"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="section-title">Detalle de facturas ({data.detalleFacturas.length})</div>
            <table>
              <thead><tr><th>N°</th><th>Cliente</th><th>Fecha</th><th>Vencimiento</th><th>Saldo</th><th>Mora</th><th>Estado</th></tr></thead>
              <tbody>
                {data.detalleFacturas.map((f: any) => (
                  <tr key={f.facturaId}>
                    <td>{f.numero}</td>
                    <td>{f.cliente}</td>
                    <td>{new Date(f.fecha).toLocaleDateString("es-AR")}</td>
                    <td>{new Date(f.vencimiento).toLocaleDateString("es-AR")}</td>
                    <td>{fmtMoney(f.saldoPendiente)}</td>
                    <td className={f.vencida ? "danger-text" : ""}>{f.vencida ? fmtDias(f.diasMora) : "—"}</td>
                    <td>{f.vencida ? f.bucket : "Por vencer"}</td>
                  </tr>
                ))}
                {data.detalleFacturas.length === 0 && <tr><td colSpan={7} className="muted">Sin facturas con saldo pendiente.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
