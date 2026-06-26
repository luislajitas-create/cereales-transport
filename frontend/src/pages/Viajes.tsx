import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Viajes() {
  const [viajes, setViajes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({ desde: "", hasta: "", clienteId: "", estado: "" });
  const [error, setError] = useState("");

  function cargar() {
    const params: any = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    api
      .get("/viajes", { params })
      .then((res) => setViajes(res.data))
      .catch(() => setError("No se pudieron cargar los viajes"));
  }

  useEffect(() => {
    cargar();
    api.get("/clientes").then((res) => setClientes(res.data));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Viajes</h1>
        <Link className="btn" to="/viajes/nuevo">+ Nuevo viaje</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters">
        <div className="field">
          <label>Desde</label>
          <input type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
        </div>
        <div className="field">
          <label>Hasta</label>
          <input type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
        </div>
        <div className="field">
          <label>Cliente</label>
          <select value={filtros.clienteId} onChange={(e) => setFiltros({ ...filtros, clienteId: e.target.value })}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.razonSocial}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
            <option value="">Todos</option>
            {["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO", "CANCELADO"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button className="btn secondary" onClick={cargar}>Filtrar</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>N°</th>
            <th>Fecha</th>
            <th>CTG</th>
            <th>Cereal</th>
            <th>Cliente</th>
            <th>Transportista</th>
            <th>Origen → Destino</th>
            <th>Tn</th>
            <th>Importe</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {viajes.map((v) => (
            <tr key={v.id}>
              <td><Link to={`/viajes/${v.id}`}>{v.numeroViaje}</Link></td>
              <td>{new Date(v.fecha).toLocaleDateString()}</td>
              <td>{v.ctg}</td>
              <td>{v.cereal?.nombre}</td>
              <td>{v.cliente?.razonSocial}</td>
              <td>{v.transportista?.razonSocial}</td>
              <td>{v.origen?.nombre} → {v.destino?.nombre}</td>
              <td>{v.toneladas}</td>
              <td>{fmtMoney(v.importeTotal)}</td>
              <td><span className={`badge ${v.estado}`}>{v.estado}</span></td>
            </tr>
          ))}
          {viajes.length === 0 && (
            <tr><td colSpan={10} className="muted">No hay viajes que coincidan con los filtros.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
