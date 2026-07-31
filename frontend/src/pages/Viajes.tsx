import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";

const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// Listado Operativo, Bloque L4.1 (AUDITORIA_DISENO_VIAJES2.0_L4_ACCIONES_RAPIDAS.md): cada fila
// tiene su propio useAsyncAction — mismo guard de doble clic por ref (no por estado) que ya usan
// ViajeForm.tsx/Usuarios.tsx, acá aplicado por fila para que avanzar una fila no bloquee ni
// contamine el busy/error de las demás.
function FilaViaje({ viaje, onEstadoActualizado }: { viaje: any; onEstadoActualizado: (id: string, nuevoEstado: string) => void }) {
  const location = useLocation();
  const { usuario } = useAuth();
  const confirm = useConfirm();
  const accion = useAsyncAction();
  // Sub-bloque L4.2: instancia propia, independiente de "accion" (Avanzar estado) — cancelar no
  // debe bloquear ni contaminar el busy/error de avanzar en la misma fila, y viceversa.
  const accionCancelar = useAsyncAction();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Ajuste UX tras validación de L4.1: mismo patrón ya usado en Organizacion.tsx (puedeEditar) —
  // refleja exactamente los roles que @Roles("OPERACIONES", "ADMINISTRADOR") ya exige en
  // create()/update()/cambiarEstado()/cancelar() de viajes.controller.ts (los cuatro comparten
  // la misma lista). El backend sigue siendo la única autoridad real; esto es solo ocultar el
  // botón para quien igual recibiría 403, en vez de mostrarlo y esperar el error. Reutilizable
  // tal cual el día que se agregue el mismo criterio a Editar en el listado.
  const puedeGestionarViajes = usuario?.rol === "OPERACIONES" || usuario?.rol === "ADMINISTRADOR";
  // Mismo guard que ViajeDetalle.tsx: si el estado actual no está en ORDEN_ESTADOS (p. ej.
  // CANCELADO), indexOf() da -1 y ORDEN_ESTADOS[-1 + 1] === ORDEN_ESTADOS[0] ("PENDIENTE") sin
  // este chequeo — mostraría "Avanzar a PENDIENTE" para un viaje cancelado.
  const idx = ORDEN_ESTADOS.indexOf(viaje.estado);
  const siguiente = idx >= 0 && idx < ORDEN_ESTADOS.length - 1 ? ORDEN_ESTADOS[idx + 1] : null;

  useEffect(() => {
    if (!menuAbierto) return;
    function cerrarSiEsAfuera(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiEsAfuera);
    return () => document.removeEventListener("mousedown", cerrarSiEsAfuera);
  }, [menuAbierto]);

  function avanzar() {
    accion.run(
      async () => {
        const { data } = await api.post(`/viajes/${viaje.id}/estado`, { estado: siguiente });
        // Actualiza solo esta fila en el estado del padre — no vuelve a pedir el listado
        // completo para reflejar un cambio que ya conocemos por la propia respuesta.
        onEstadoActualizado(viaje.id, data.estado);
        return data;
      },
      { errorMessage: "No se pudo cambiar el estado" },
    );
  }

  // Sub-bloque L4.2 (AUDITORIA_DISENO_VIAJES2.0_L4.2_CANCELAR_LISTADO.md): mismo modal
  // (ConfirmDialog/useConfirm) y mismo endpoint que ya usa ViajeDetalle.tsx — la cancelación
  // nunca se ejecuta directamente: abrir el menú, elegir "Cancelar", confirmar con motivo
  // obligatorio son tres pasos deliberados antes de la escritura.
  async function cancelar() {
    setMenuAbierto(false);
    const ok = await confirm({
      title: "Cancelar viaje",
      message: `¿Cancelar el viaje N° ${viaje.numeroViaje}?`,
      requireMotivo: true,
      confirmLabel: "Cancelar viaje",
    });
    if (!ok.confirmed) return;
    accionCancelar.run(
      async () => {
        const { data } = await api.post(`/viajes/${viaje.id}/cancelar`, { motivo: ok.motivo });
        onEstadoActualizado(viaje.id, data.estado);
        return data;
      },
      { errorMessage: "No se pudo cancelar el viaje" },
    );
  }

  return (
    <tr>
      <td>
        <Link to={`/viajes/${viaje.id}`} state={{ volverA: location.pathname + location.search }}>
          {viaje.numeroViaje}
        </Link>
      </td>
      <td>{new Date(viaje.fecha).toLocaleDateString()}</td>
      <td>{viaje.ctg}</td>
      <td>{viaje.cereal?.nombre}</td>
      <td>{viaje.cliente?.razonSocial}</td>
      <td>{viaje.transportista?.razonSocial}</td>
      <td>{viaje.origen?.nombre} → {viaje.destino?.nombre}</td>
      <td>{viaje.toneladas}</td>
      <td>{fmtMoney(viaje.importeTotal)}</td>
      <td>
        <span className={`badge ${viaje.estado}`}>{viaje.estado}</span>
        {(accion.error || accionCancelar.error) && (
          <div className="error-banner" style={{ marginTop: "0.3rem", fontSize: "0.75rem", padding: "0.3rem 0.5rem" }}>
            {accion.error || accionCancelar.error}
          </div>
        )}
      </td>
      <td style={{ position: "relative", whiteSpace: "nowrap" }}>
        {siguiente && puedeGestionarViajes && (
          <button className="btn secondary" disabled={accion.busy} onClick={avanzar}>
            {accion.busy ? "Avanzando..." : `Avanzar a ${siguiente}`}
          </button>
        )}
        {viaje.estado !== "CANCELADO" && puedeGestionarViajes && (
          <span ref={menuRef} style={{ position: "relative", marginLeft: "0.4rem" }}>
            <button
              className="btn secondary"
              style={{ padding: "0.5rem 0.7rem" }}
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Más acciones"
            >
              ⋮
            </button>
            {menuAbierto && (
              <div
                style={{
                  position: "absolute", right: 0, top: "100%", marginTop: "0.2rem", zIndex: 10,
                  background: "white", border: "1px solid var(--border)", borderRadius: "4px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)", minWidth: "150px", overflow: "hidden",
                }}
              >
                <button
                  className="btn danger"
                  style={{ width: "100%", borderRadius: 0 }}
                  disabled={accionCancelar.busy}
                  onClick={cancelar}
                >
                  {accionCancelar.busy ? "Cancelando..." : "Cancelar viaje"}
                </button>
              </div>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}

export default function Viajes() {
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

  function actualizarEstadoFila(id: string, nuevoEstado: string) {
    setViajes((prev) => prev.map((v) => (v.id === id ? { ...v, estado: nuevoEstado } : v)));
  }

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
    </div>
  );
}
