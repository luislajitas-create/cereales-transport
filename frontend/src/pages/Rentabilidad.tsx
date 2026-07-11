import { useEffect, useState } from "react";
import { api } from "../api/client";

// Bloque 7.3.1 — esta pantalla solo presenta lo que el backend ya calculó.
// No debe contener ninguna operación aritmética sobre importes/porcentajes
// (BLOQUE7.3.1_DISENO_RENTABILIDAD.md, sección 6, y criterio de aceptación, punto 6) —
// fmtMoney/fmtPct son formato de presentación, no cálculo.

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

function fmtPct(n: number) {
  return `${(n || 0).toFixed(1)}%`;
}

function primerDiaDelMes() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function Rentabilidad() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ desde: primerDiaDelMes(), hasta: hoy(), clienteId: "", transportistaId: "" });
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [expandidoCliente, setExpandidoCliente] = useState<string | null>(null);
  const [expandidoTransportista, setExpandidoTransportista] = useState<string | null>(null);

  useEffect(() => {
    api.get("/clientes").then((res) => setClientes(res.data));
    api.get("/transportistas").then((res) => setTransportistas(res.data));
  }, []);

  async function buscar() {
    setError("");
    setCargando(true);
    try {
      const params: any = { desde: filtros.desde, hasta: filtros.hasta };
      if (filtros.clienteId) params.clienteId = filtros.clienteId;
      if (filtros.transportistaId) params.transportistaId = filtros.transportistaId;
      const { data: res } = await api.get("/inteligencia/rentabilidad", { params });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo obtener la rentabilidad del período");
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
      <div className="page-header"><h1>Rentabilidad</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="section-title">Filtros</div>
        <div className="filters">
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          <select value={filtros.clienteId} onChange={(e) => setFiltros({ ...filtros, clienteId: e.target.value })}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
          </select>
          <select value={filtros.transportistaId} onChange={(e) => setFiltros({ ...filtros, transportistaId: e.target.value })}>
            <option value="">Todos los transportistas</option>
            {transportistas.map((t) => <option key={t.id} value={t.id}>{t.razonSocial}</option>)}
          </select>
          <button className="btn" onClick={buscar} disabled={cargando}>{cargando ? "Calculando..." : "Buscar"}</button>
        </div>
      </div>

      {data && (
        <>
          <div className="card">
            <div className="section-title">Totales del período</div>
            <table>
              <thead>
                <tr>
                  <th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th>
                  <th>Viajes completos</th><th>Viajes incompletos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{fmtMoney(data.totales.ingreso)}</td>
                  <td>{fmtMoney(data.totales.costo)}</td>
                  <td>{fmtMoney(data.totales.margen)}</td>
                  <td>{fmtPct(data.totales.margenPct)}</td>
                  <td>{data.totales.viajesCompletos}</td>
                  <td>{data.totales.viajesIncompletos}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="section-title">Por cliente</div>
            <table>
              <thead><tr><th>Cliente</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th><th>Viajes</th><th></th></tr></thead>
              <tbody>
                {data.porCliente.map((row: any) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{fmtMoney(row.ingreso)}</td>
                    <td>{fmtMoney(row.costo)}</td>
                    <td>{fmtMoney(row.margen)}</td>
                    <td>{fmtPct(row.margenPct)}</td>
                    <td>{row.viajes}</td>
                    <td>
                      <button className="btn secondary" onClick={() => setExpandidoCliente(expandidoCliente === row.id ? null : row.id)}>
                        {expandidoCliente === row.id ? "Cerrar" : "Ver viajes"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.porCliente.length === 0 && <tr><td colSpan={7} className="muted">Sin viajes completos para los filtros seleccionados.</td></tr>}
              </tbody>
            </table>
            {expandidoCliente && (
              <table>
                <thead><tr><th>N°</th><th>Fecha</th><th>Transportista</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th></tr></thead>
                <tbody>
                  {data.detalleViajes.filter((v: any) => v.clienteId === expandidoCliente).map((v: any) => (
                    <tr key={v.viajeId}>
                      <td>{v.numeroViaje}</td>
                      <td>{new Date(v.fecha).toLocaleDateString("es-AR")}</td>
                      <td>{v.transportista}</td>
                      <td>{fmtMoney(v.ingreso)}</td>
                      <td>{fmtMoney(v.costo)}</td>
                      <td>{fmtMoney(v.margen)}</td>
                      <td>{fmtPct(v.margenPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="section-title">Por transportista</div>
            <table>
              <thead><tr><th>Transportista</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th><th>Viajes</th><th></th></tr></thead>
              <tbody>
                {data.porTransportista.map((row: any) => (
                  <tr key={row.id}>
                    <td>{row.nombre}</td>
                    <td>{fmtMoney(row.ingreso)}</td>
                    <td>{fmtMoney(row.costo)}</td>
                    <td>{fmtMoney(row.margen)}</td>
                    <td>{fmtPct(row.margenPct)}</td>
                    <td>{row.viajes}</td>
                    <td>
                      <button className="btn secondary" onClick={() => setExpandidoTransportista(expandidoTransportista === row.id ? null : row.id)}>
                        {expandidoTransportista === row.id ? "Cerrar" : "Ver viajes"}
                      </button>
                    </td>
                  </tr>
                ))}
                {data.porTransportista.length === 0 && <tr><td colSpan={7} className="muted">Sin viajes completos para los filtros seleccionados.</td></tr>}
              </tbody>
            </table>
            {expandidoTransportista && (
              <table>
                <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th></tr></thead>
                <tbody>
                  {data.detalleViajes.filter((v: any) => v.transportistaId === expandidoTransportista).map((v: any) => (
                    <tr key={v.viajeId}>
                      <td>{v.numeroViaje}</td>
                      <td>{new Date(v.fecha).toLocaleDateString("es-AR")}</td>
                      <td>{v.cliente}</td>
                      <td>{fmtMoney(v.ingreso)}</td>
                      <td>{fmtMoney(v.costo)}</td>
                      <td>{fmtMoney(v.margen)}</td>
                      <td>{fmtPct(v.margenPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="section-title">Detalle de viajes ({data.detalleViajes.length})</div>
            <table>
              <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Transportista</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th></tr></thead>
              <tbody>
                {data.detalleViajes.map((v: any) => (
                  <tr key={v.viajeId}>
                    <td>{v.numeroViaje}</td>
                    <td>{new Date(v.fecha).toLocaleDateString("es-AR")}</td>
                    <td>{v.cliente}</td>
                    <td>{v.transportista}</td>
                    <td>{fmtMoney(v.ingreso)}</td>
                    <td>{fmtMoney(v.costo)}</td>
                    <td>{fmtMoney(v.margen)}</td>
                    <td>{fmtPct(v.margenPct)}</td>
                  </tr>
                ))}
                {data.detalleViajes.length === 0 && <tr><td colSpan={8} className="muted">Sin viajes completos para los filtros seleccionados.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card warning-card">
            <div className="section-title">Viajes incompletos del período ({data.viajesIncompletos.length})</div>
            <p className="muted">Viajes descargados en el período que todavía no tienen factura y/o liquidación vigente — no participan de los totales ni de los rankings de arriba.</p>
            <table>
              <thead><tr><th>N°</th><th>Fecha</th><th>Motivo</th></tr></thead>
              <tbody>
                {data.viajesIncompletos.map((v: any) => (
                  <tr key={v.viajeId}>
                    <td>{v.numeroViaje}</td>
                    <td>{new Date(v.fecha).toLocaleDateString("es-AR")}</td>
                    <td>{v.motivo}</td>
                  </tr>
                ))}
                {data.viajesIncompletos.length === 0 && <tr><td colSpan={3} className="muted">Ninguno.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
