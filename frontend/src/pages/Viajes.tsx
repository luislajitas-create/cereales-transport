import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Viajes() {
  // Listado Operativo, Bloque L3 (AUDITORIA_DISENO_VIAJES2.0_L3_PERSISTENCIA_LISTADO.md, v1):
  // los filtros y la búsqueda se inicializan desde la URL (mismo patrón que Catalogos.tsx con
  // ?tab=) para que un refresh o un link directo reproduzcan el mismo listado filtrado.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [viajes, setViajes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    desde: searchParams.get("desde") || "",
    hasta: searchParams.get("hasta") || "",
    clienteId: searchParams.get("clienteId") || "",
    estado: searchParams.get("estado") || "",
    q: searchParams.get("q") || "",
  });
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

  // Sincroniza la URL con los filtros vigentes al momento de aplicar — "replace" para no dejar
  // una entrada de historial por cada clic en "Filtrar" (evitaría que "atrás" quede atascado
  // deshaciendo filtros en vez de volver a la pantalla anterior real).
  function aplicarFiltros() {
    const params: Record<string, string> = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    setSearchParams(params, { replace: true });
    cargar();
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
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Buscar por CTG, Carta de Porte o Nº de Viaje"
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
          />
        </div>
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
        <button className="btn secondary" onClick={aplicarFiltros}>Filtrar</button>
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
              <td>
                {/* Bloque L3: le pasa al Detalle la URL exacta del listado (con los filtros/
                    búsqueda vigentes) para que el link "Volver al listado" sepa a dónde volver. */}
                <Link to={`/viajes/${v.id}`} state={{ volverA: location.pathname + location.search }}>
                  {v.numeroViaje}
                </Link>
              </td>
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
