import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const FILTROS_VACIOS = { usuarioId: "", accion: "", entidad: "", entidadId: "", fechaDesde: "", fechaHasta: "" };
const LIMITES = [10, 20, 50, 100];

export default function AuditoriaAdministrativa() {
  const { usuario } = useAuth();

  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [datos, setDatos] = useState<any[]>([]);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(20);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  function buscar(paginaNueva: number, limiteNuevo: number, filtrosActuales: typeof FILTROS_VACIOS) {
    setCargando(true);
    setError("");
    const params: any = { page: paginaNueva, limit: limiteNuevo };
    if (filtrosActuales.usuarioId) params.usuarioId = filtrosActuales.usuarioId;
    if (filtrosActuales.accion) params.accion = filtrosActuales.accion;
    if (filtrosActuales.entidad) params.entidad = filtrosActuales.entidad;
    if (filtrosActuales.entidadId) params.entidadId = filtrosActuales.entidadId;
    if (filtrosActuales.fechaDesde) params.fechaDesde = filtrosActuales.fechaDesde;
    if (filtrosActuales.fechaHasta) params.fechaHasta = filtrosActuales.fechaHasta;

    api
      .get("/organizacion/auditoria", { params })
      .then((res) => {
        setDatos(res.data.datos);
        setTotal(res.data.total);
        setPagina(res.data.pagina);
        setLimite(res.data.limite);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message;
        setError(msg === "Forbidden resource" ? "No tenés permiso para ver esta sección." : msg || "No se pudo cargar la auditoría.");
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    // GET /organizacion/auditoria no está restringido por rol de forma distinta a las demás
    // pantallas administrativas — mismo criterio que Usuarios.tsx: la pantalla es exclusiva de
    // ADMINISTRADOR, así que ni siquiera se consulta el backend para otro rol.
    if (usuario?.rol === "ADMINISTRADOR") buscar(1, limite, FILTROS_VACIOS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    buscar(1, limite, filtros);
  }

  function limpiarFiltros() {
    setFiltros(FILTROS_VACIOS);
    buscar(1, limite, FILTROS_VACIOS);
  }

  function cambiarLimite(nuevo: number) {
    buscar(1, nuevo, filtros);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  if (usuario?.rol !== "ADMINISTRADOR") {
    return (
      <div>
        <div className="page-header"><h1>Auditoría Administrativa</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header"><h1>Auditoría Administrativa</h1></div>

      <form className="filters" onSubmit={handleBuscar}>
        <div className="field">
          <label>Usuario</label>
          <input value={filtros.usuarioId} onChange={(e) => setFiltros({ ...filtros, usuarioId: e.target.value })} placeholder="ID de usuario" />
        </div>
        <div className="field">
          <label>Acción</label>
          <input value={filtros.accion} onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })} />
        </div>
        <div className="field">
          <label>Entidad</label>
          <input value={filtros.entidad} onChange={(e) => setFiltros({ ...filtros, entidad: e.target.value })} />
        </div>
        <div className="field">
          <label>Entidad ID</label>
          <input value={filtros.entidadId} onChange={(e) => setFiltros({ ...filtros, entidadId: e.target.value })} />
        </div>
        <div className="field">
          <label>Fecha desde</label>
          <input type="date" value={filtros.fechaDesde} onChange={(e) => setFiltros({ ...filtros, fechaDesde: e.target.value })} />
        </div>
        <div className="field">
          <label>Fecha hasta</label>
          <input type="date" value={filtros.fechaHasta} onChange={(e) => setFiltros({ ...filtros, fechaHasta: e.target.value })} />
        </div>
        <button className="btn" type="submit">Buscar</button>
        <button className="btn secondary" type="button" onClick={limpiarFiltros}>Limpiar</button>
      </form>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {cargando && <p className="muted">Cargando...</p>}
        {!cargando && !error && datos.length === 0 && <p className="muted">No hay eventos que coincidan con los filtros.</p>}
        {!cargando && !error && datos.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Entidad ID</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((d) => (
                  <tr key={d.id}>
                    <td>{new Date(d.fecha).toLocaleString()}</td>
                    <td>{d.usuario?.nombre || "—"}</td>
                    <td>{d.usuario?.email || "—"}</td>
                    <td>{d.usuario?.rol || "—"}</td>
                    <td>{d.accion}</td>
                    <td>{d.entidad}</td>
                    <td>{d.entidadId}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="checkbox-row">
                <button className="btn secondary" disabled={pagina <= 1} onClick={() => buscar(pagina - 1, limite, filtros)}>Anterior</button>
                <span className="muted">Página {pagina} de {totalPaginas} ({total} en total)</span>
                <button className="btn secondary" disabled={pagina >= totalPaginas} onClick={() => buscar(pagina + 1, limite, filtros)}>Siguiente</button>
              </div>
              <div className="checkbox-row">
                <label className="muted">Por página</label>
                <select value={limite} onChange={(e) => cambiarLimite(Number(e.target.value))}>
                  {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
