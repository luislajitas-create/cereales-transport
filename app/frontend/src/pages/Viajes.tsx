import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Viajes() {
  const [viajes, setViajes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [choferes, setChoferes] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [productores, setProductores] = useState<any[]>([]);
  const [cereales, setCereales] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    desde: "",
    hasta: "",
    clienteId: "",
    transportistaId: "",
    choferId: "",
    productorId: "",
    cerealId: "",
    origenId: "",
    destinoId: "",
    estado: "",
    cartaPorte: "",
    ctg: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function cargar() {
    setLoading(true);
    setError("");
    const params: any = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    api
      .get("/viajes", { params })
      .then((res) => setViajes(res.data))
      .catch(() => setError("No se pudieron cargar los viajes"))
      .finally(() => setLoading(false));
  }

  function exportarExcel() {
    const params: any = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    const queryString = new URLSearchParams(params).toString();
    window.location.href = `/api/viajes/export/excel?${queryString}`;
  }

  function exportarPdf() {
    const params: any = {};
    Object.entries(filtros).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    const queryString = new URLSearchParams(params).toString();
    window.location.href = `/api/viajes/export/pdf?${queryString}`;
  }

  function limpiarFiltros() {
    setFiltros({
      desde: "", hasta: "", clienteId: "", transportistaId: "",
      choferId: "", productorId: "", cerealId: "",
      origenId: "", destinoId: "", estado: "", cartaPorte: "", ctg: "",
    });
  }

  useEffect(() => {
    cargar();
    Promise.all([
      api.get("/clientes").then((res) => setClientes(res.data)),
      api.get("/choferes").then((res) => setChoferes(res.data)),
      api.get("/transportistas").then((res) => setTransportistas(res.data)),
      api.get("/productores").then((res) => setProductores(res.data)),
      api.get("/cereales").then((res) => setCereales(res.data)),
      api.get("/ubicaciones").then((res) => setUbicaciones(res.data)),
    ]).catch((err) => console.error("Error cargando datos", err));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Viajes</h1>
        <Link className="btn" to="/viajes/nuevo">+ Nuevo viaje</Link>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "12px" }}>
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
            <label>Transportista</label>
            <select value={filtros.transportistaId} onChange={(e) => setFiltros({ ...filtros, transportistaId: e.target.value })}>
              <option value="">Todos</option>
              {transportistas.map((t) => (
                <option key={t.id} value={t.id}>{t.razonSocial}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Chofer</label>
            <select value={filtros.choferId} onChange={(e) => setFiltros({ ...filtros, choferId: e.target.value })}>
              <option value="">Todos</option>
              {choferes.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Productor</label>
            <select value={filtros.productorId} onChange={(e) => setFiltros({ ...filtros, productorId: e.target.value })}>
              <option value="">Todos</option>
              {productores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cereal</label>
            <select value={filtros.cerealId} onChange={(e) => setFiltros({ ...filtros, cerealId: e.target.value })}>
              <option value="">Todos</option>
              {cereales.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Origen</label>
            <select value={filtros.origenId} onChange={(e) => setFiltros({ ...filtros, origenId: e.target.value })}>
              <option value="">Todos</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Destino</label>
            <select value={filtros.destinoId} onChange={(e) => setFiltros({ ...filtros, destinoId: e.target.value })}>
              <option value="">Todos</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
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
          <div className="field">
            <label>Carta de Porte</label>
            <input type="text" placeholder="CP..." value={filtros.cartaPorte} onChange={(e) => setFiltros({ ...filtros, cartaPorte: e.target.value })} />
          </div>
          <div className="field">
            <label>CTG</label>
            <input type="text" placeholder="CTG..." value={filtros.ctg} onChange={(e) => setFiltros({ ...filtros, ctg: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn secondary" onClick={cargar} disabled={loading}>{loading ? "Cargando..." : "Filtrar"}</button>
          <button className="btn secondary" onClick={limpiarFiltros}>Limpiar filtros</button>
          <button className="btn secondary" onClick={exportarExcel} title="Descargar como Excel">📊 Excel</button>
          <button className="btn secondary" onClick={exportarPdf} title="Descargar como PDF">📄 PDF</button>
        </div>
      </div>

      <p style={{ marginTop: "12px", color: "#666" }}>
        Total: <strong>{viajes.length}</strong> viaje{viajes.length !== 1 ? "s" : ""}
      </p>

      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Cliente</th>
            <th>Chofer</th>
            <th>CP</th>
            <th>CTG</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Tn</th>
            <th>Tarifa</th>
            <th>Importe</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {viajes.map((v) => (
            <tr key={v.id}>
              <td>{new Date(v.fecha).toLocaleDateString()}</td>
              <td>{v.cliente?.razonSocial}</td>
              <td>{v.chofer?.nombre}</td>
              <td>{v.cartaPorte || "-"}</td>
              <td>{v.ctg || "-"}</td>
              <td>{v.origen?.nombre || "-"}</td>
              <td>{v.destino?.nombre || "-"}</td>
              <td>{v.toneladas}</td>
              <td>{fmtMoney(v.tarifaTonelada)}</td>
              <td>{fmtMoney(v.importeTotal)}</td>
              <td><span className={`badge ${v.estado}`}>{v.estado}</span></td>
              <td style={{ fontSize: "12px", whiteSpace: "nowrap" }}>
                <Link to={`/viajes/${v.id}`} className="btn btn-small" title="Ver detalle">📋</Link>
              </td>
            </tr>
          ))}
          {viajes.length === 0 && (
            <tr><td colSpan={12} className="muted" style={{ textAlign: "center", padding: "20px" }}>No hay viajes que coincidan con los filtros.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}