import { useEffect, useState } from "react";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Conciliacion() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ clienteId: "", desde: "", hasta: "" });
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

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
      const { data: res } = await api.get("/facturas/conciliacion", { params });
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo obtener la conciliación");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    buscar();
  }, []);

  return (
    <div>
      <div className="page-header"><h1>Conciliación de Viajes</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="section-title">Filtros</div>
        <div className="filters">
          <select value={filtros.clienteId} onChange={(e) => setFiltros({ ...filtros, clienteId: e.target.value })}>
            <option value="">Todos los clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
          </select>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          <button className="btn" onClick={buscar} disabled={cargando}>{cargando ? "Buscando..." : "Buscar"}</button>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Realizado vs. Facturado por cliente</div>
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Tn realizadas</th>
              <th>Importe realizado</th>
              <th>Tn facturadas</th>
              <th>Importe facturado</th>
              <th>Diferencia Tn</th>
              <th>Diferencia importe</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.clienteId}>
                <td>{row.cliente}</td>
                <td>{row.toneladasRealizadas}</td>
                <td>{fmtMoney(row.importeRealizado)}</td>
                <td>{row.toneladasFacturadas}</td>
                <td>{fmtMoney(row.importeFacturado)}</td>
                <td className={row.diferenciaToneladas > 0 ? "danger-text" : ""}>{row.diferenciaToneladas}</td>
                <td className={row.diferenciaImporte > 0 ? "danger-text" : ""}>{fmtMoney(row.diferenciaImporte)}</td>
                <td>
                  {row.viajesPendientes?.length > 0 && (
                    <button className="btn secondary" onClick={() => setExpandido(expandido === row.clienteId ? null : row.clienteId)}>
                      {expandido === row.clienteId ? "Cerrar" : `Ver pendientes (${row.viajesPendientes.length})`}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={8} className="muted">Sin datos para los filtros seleccionados.</td></tr>}
          </tbody>
        </table>
      </div>

      {data.filter((row) => row.clienteId === expandido).map((row) => (
        <div className="card" key={row.clienteId}>
          <div className="section-title">Viajes pendientes de facturar — {row.cliente}</div>
          <table>
            <thead><tr><th>N°</th><th>Fecha</th><th>CTG</th><th>Cereal</th><th>Tn</th><th>Importe</th></tr></thead>
            <tbody>
              {row.viajesPendientes.map((v: any) => (
                <tr key={v.id}>
                  <td>{v.numeroViaje}</td>
                  <td>{new Date(v.fecha).toLocaleDateString()}</td>
                  <td>{v.ctg}</td>
                  <td>{v.cereal}</td>
                  <td>{v.toneladas}</td>
                  <td>{fmtMoney(v.importeTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
