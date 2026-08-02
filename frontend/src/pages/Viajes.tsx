import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import FilaViaje from "../components/FilaViaje";

// H-11 (AUDITORIA_VIAJES2.0_RC1.md, H-11): mismos valores que LIMITES de
// AuditoriaAdministrativa.tsx (único precedente de paginación ya validado en el frontend).
const LIMITES = [10, 20, 50, 100];

export default function Viajes() {
  // L4.3 (AUDITORIA_VIAJES2.0_RC1.md, H-4): mismo criterio que ya usa FilaViaje más abajo —
  // duplicado deliberado (es una constante de una línea, no amerita una abstracción nueva).
  const { usuario } = useAuth();
  const puedeGestionarViajes = usuario?.rol === "OPERACIONES" || usuario?.rol === "ADMINISTRADOR";
  // Listado Operativo, Bloque L3 (AUDITORIA_DISENO_VIAJES2.0_L3_PERSISTENCIA_LISTADO.md, v1):
  // los filtros y la búsqueda se inicializan desde la URL (mismo patrón que Catalogos.tsx con
  // ?tab=) para que un refresh o un link directo reproduzcan el mismo listado filtrado.
  const [searchParams, setSearchParams] = useSearchParams();
  const [viajes, setViajes] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    desde: searchParams.get("desde") || "",
    hasta: searchParams.get("hasta") || "",
    clienteId: searchParams.get("clienteId") || "",
    estado: searchParams.get("estado") || "",
    q: searchParams.get("q") || "",
  });
  // H-11 (AUDITORIA_VIAJES2.0_RC1.md, H-11): mismo criterio de L3 (filtros persistidos en la
  // URL) extendido a page/limit, para que un refresh o un link directo reproduzca exactamente
  // la misma página y tamaño de página, no solo los mismos filtros.
  const [pagina, setPagina] = useState(Number(searchParams.get("page")) || 1);
  const [limite, setLimite] = useState(Number(searchParams.get("limit")) || 20);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // H-11: reemplaza a cargar()/aplicarFiltros() — mismo patrón que buscar() en
  // AuditoriaAdministrativa.tsx (único precedente de paginación ya validado), extendido acá
  // para además sincronizar la URL (L3), algo que ese precedente no hacía. Recibe page/limit/
  // filtros explícitos (no los lee de `pagina`/`limite`/`filtros` por closure) para no quedar
  // sujeto al retraso de un `setState` async — el mismo objeto de params se usa tanto para la
  // URL como para la request, así ambos quedan siempre en sincronía.
  function buscar(paginaNueva: number, limiteNueva: number, filtrosActuales: typeof filtros) {
    const params: Record<string, string> = { page: String(paginaNueva), limit: String(limiteNueva) };
    Object.entries(filtrosActuales).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    setSearchParams(params, { replace: true });
    api
      .get("/viajes", { params })
      .then((res) => {
        setViajes(res.data.datos);
        setPagina(res.data.pagina);
        setLimite(res.data.limite);
        setTotal(res.data.total);
      })
      .catch(() => setError("No se pudieron cargar los viajes"));
  }

  // Cambiar un filtro o la búsqueda vuelve siempre a la página 1 (no tendría sentido conservar
  // una página que puede ya no existir con el nuevo resultado filtrado); conserva el límite
  // vigente. Mismo criterio que cambiarLimite() de AuditoriaAdministrativa.tsx.
  function aplicarFiltros() {
    buscar(1, limite, filtros);
  }

  function irAPagina(nuevaPagina: number) {
    buscar(nuevaPagina, limite, filtros);
  }

  function cambiarLimite(nuevoLimite: number) {
    buscar(1, nuevoLimite, filtros);
  }

  useEffect(() => {
    buscar(pagina, limite, filtros);
    api.get("/clientes").then((res) => setClientes(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // H-9 (AUDITORIA_VIAJES2.0_RC1.md, H-9): useCallback con deps vacías — solo usa el setter de
  // estado (siempre estable) vía forma funcional, sin cerrar sobre ningún valor del render. Sin
  // esto, FilaViaje (memo) recibiría una referencia nueva de onEstadoActualizado en cada render
  // de Viajes y el memo no tendría ningún efecto.
  const actualizarEstadoFila = useCallback((id: string, nuevoEstado: string) => {
    setViajes((prev) => prev.map((v) => (v.id === id ? { ...v, estado: nuevoEstado } : v)));
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  return (
    <div>
      <div className="page-header">
        <h1>Viajes</h1>
        {puedeGestionarViajes && <Link className="btn" to="/viajes/nuevo">+ Nuevo viaje</Link>}
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
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {viajes.map((v) => (
            <FilaViaje key={v.id} viaje={v} onEstadoActualizado={actualizarEstadoFila} />
          ))}
          {viajes.length === 0 && (
            <tr><td colSpan={11} className="muted">No hay viajes que coincidan con los filtros.</td></tr>
          )}
        </tbody>
      </table>

      {viajes.length > 0 && (
        <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="checkbox-row">
            <button className="btn secondary" disabled={pagina <= 1} onClick={() => irAPagina(pagina - 1)}>Anterior</button>
            <span className="muted">Página {pagina} de {totalPaginas} ({total} en total)</span>
            <button className="btn secondary" disabled={pagina >= totalPaginas} onClick={() => irAPagina(pagina + 1)}>Siguiente</button>
          </div>
          <div className="checkbox-row">
            <label className="muted">Por página</label>
            <select value={limite} onChange={(e) => cambiarLimite(Number(e.target.value))}>
              {LIMITES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
