import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

// Bloque 7.3.4 — esta pantalla solo presenta lo que el backend ya calculó (consumidor puro
// del Motor de Inteligencia, ver DashboardEjecutivoController). fmtMoney/fmtPct/fmtDias son
// formato de presentación, no cálculo — no hay ningún +/-/*// sobre importes o porcentajes acá.

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

function fmtPct(n: number) {
  return `${(n || 0).toFixed(1)}%`;
}

function fmtDias(n: number | null | undefined) {
  return n === null || n === undefined ? "—" : `${n} días`;
}

function primerDiaDelMes() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

const ETIQUETA_TIPO: Record<string, string> = {
  factura_vencida: "Factura vencida",
  factura_proxima_vencer: "Factura próxima a vencer",
  cliente_deuda_vencida: "Cliente con deuda vencida elevada",
  concentracion_cliente: "Concentración de deuda en un cliente",
  anticipo_sin_liquidar: "Anticipo sin liquidar",
  chofer_anticipos_altos: "Chofer con anticipos acumulados altos",
  viaje_sin_facturar: "Viaje sin facturar",
  viaje_sin_liquidar: "Viaje sin liquidar",
  viaje_estancado: "Viaje estancado",
};

export default function DashboardEjecutivo() {
  const [filtros, setFiltros] = useState({ desde: primerDiaDelMes(), hasta: hoy() });
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function buscar() {
    setError("");
    setCargando(true);
    try {
      const { data: res } = await api.get("/inteligencia/dashboard-ejecutivo", {
        params: { desde: filtros.desde, hasta: filtros.hasta },
      });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo obtener el dashboard ejecutivo");
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
      <div className="page-header"><h1>Dashboard Ejecutivo</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="section-title">Período (afecta Rentabilidad y DSO — la cartera y las alertas siempre son a hoy)</div>
        <div className="filters">
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          <button className="btn" onClick={buscar} disabled={cargando}>{cargando ? "Calculando..." : "Buscar"}</button>
        </div>
      </div>

      {data && (
        <>
          <div className="section-title">Resumen financiero del período ({data.periodo.desde} a {data.periodo.hasta})</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Ingreso</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.ingreso)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Costo</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.costo)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Margen</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.margen)}</div>
              <div className="sub">{fmtPct(data.resumenFinanciero.margenPct)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Total pendiente de cobro</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.totalPendiente)}</div>
              <div className="sub">a hoy ({data.fechaCorte})</div>
            </div>
            <div className="kpi-card">
              <div className="label">Deuda vencida</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.deudaVencida)}</div>
              <div className="sub">a hoy</div>
            </div>
            <div className="kpi-card">
              <div className="label">Deuda por vencer</div>
              <div className="value">{fmtMoney(data.resumenFinanciero.deudaPorVencer)}</div>
              <div className="sub">a hoy</div>
            </div>
          </div>

          <div className="section-title">Cartera — KPIs (a hoy)</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="label">Facturas vencidas</div>
              <div className="value">{data.kpisCartera.facturasVencidas}</div>
            </div>
            <div className="kpi-card">
              <div className="label">Clientes con deuda vencida</div>
              <div className="value">{data.kpisCartera.clientesConDeudaVencida}</div>
            </div>
            <div className="kpi-card">
              <div className="label">DSO histórico (oficial)</div>
              <div className="value">{fmtDias(data.kpisCartera.dso.historico?.dias ?? null)}</div>
            </div>
            <div className="kpi-card">
              <div className="label">DSO aproximado (snapshot)</div>
              <div className="value">{fmtDias(data.kpisCartera.dso.snapshotClasico.dias)}</div>
              <div className="sub">aproximación de industria, no exacto</div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Alertas</div>
            <table>
              <thead><tr><th>Críticas</th><th>Preventivas</th><th>Informativas</th><th>Total</th></tr></thead>
              <tbody>
                <tr>
                  <td className={data.alertas.resumen.criticas > 0 ? "danger-text" : ""}>{data.alertas.resumen.criticas}</td>
                  <td>{data.alertas.resumen.preventivas}</td>
                  <td>{data.alertas.resumen.informativas}</td>
                  <td>{data.alertas.resumen.total}</td>
                </tr>
              </tbody>
            </table>
            {data.alertas.principales.length > 0 && (
              <table>
                <thead><tr><th>Severidad</th><th>Tipo</th><th>Mensaje</th></tr></thead>
                <tbody>
                  {data.alertas.principales.map((a: any, i: number) => (
                    <tr key={i}>
                      <td className={a.severidad === "critica" ? "danger-text" : ""}>{a.severidad}</td>
                      <td>{ETIQUETA_TIPO[a.tipo] || a.tipo}</td>
                      <td>{a.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="actions-row">
              <Link className="btn secondary" to="/inteligencia/alertas">Ver Centro de Alertas completo</Link>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Principales clientes por margen</div>
            <table>
              <thead><tr><th>Cliente</th><th>Margen</th><th>Margen %</th><th>Viajes</th></tr></thead>
              <tbody>
                {data.rankings.principalesClientesPorMargen.map((c: any) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td>{fmtMoney(c.margen)}</td>
                    <td>{fmtPct(c.margenPct)}</td>
                    <td>{c.viajes}</td>
                  </tr>
                ))}
                {data.rankings.principalesClientesPorMargen.length === 0 && <tr><td colSpan={4} className="muted">Sin viajes completos en el período.</td></tr>}
              </tbody>
            </table>
            <div className="actions-row">
              <Link className="btn secondary" to="/inteligencia/rentabilidad">Ver Rentabilidad completa</Link>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Principales transportistas por margen</div>
            <table>
              <thead><tr><th>Transportista</th><th>Margen</th><th>Margen %</th><th>Viajes</th></tr></thead>
              <tbody>
                {data.rankings.principalesTransportistasPorMargen.map((t: any) => (
                  <tr key={t.id}>
                    <td>{t.nombre}</td>
                    <td>{fmtMoney(t.margen)}</td>
                    <td>{fmtPct(t.margenPct)}</td>
                    <td>{t.viajes}</td>
                  </tr>
                ))}
                {data.rankings.principalesTransportistasPorMargen.length === 0 && <tr><td colSpan={4} className="muted">Sin viajes completos en el período.</td></tr>}
              </tbody>
            </table>
            <div className="actions-row">
              <Link className="btn secondary" to="/inteligencia/rentabilidad">Ver Rentabilidad completa</Link>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Principales clientes por deuda vencida (a hoy)</div>
            <table>
              <thead><tr><th>Cliente</th><th>Deuda vencida</th><th>Mora promedio</th><th>Facturas</th></tr></thead>
              <tbody>
                {data.rankings.principalesClientesPorDeudaVencida.map((c: any) => (
                  <tr key={c.clienteId}>
                    <td>{c.cliente}</td>
                    <td className={c.totalVencido > 0 ? "danger-text" : ""}>{fmtMoney(c.totalVencido)}</td>
                    <td>{fmtDias(Math.round(c.diasMoraPromedio))}</td>
                    <td>{c.facturas}</td>
                  </tr>
                ))}
                {data.rankings.principalesClientesPorDeudaVencida.length === 0 && <tr><td colSpan={4} className="muted">Sin cartera pendiente.</td></tr>}
              </tbody>
            </table>
            <div className="actions-row">
              <Link className="btn secondary" to="/inteligencia/cobranzas/aging">Ver Aging completo</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
