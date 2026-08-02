import { memo, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "./ConfirmDialog";
import { fmtFechaCalendario } from "../utils/fecha";
import { ORDEN_ESTADOS } from "../utils/estadosViaje";

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
      <td>{fmtFechaCalendario(viaje.fecha)}</td>
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
          <span ref={menuRef} className="dropdown">
            <button
              className="btn secondary dropdown-trigger"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-label="Más acciones"
            >
              ⋮
            </button>
            {menuAbierto && (
              <div className="dropdown-menu">
                <button
                  className="btn danger dropdown-menu-item"
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

// H-9 (AUDITORIA_VIAJES2.0_RC1.md, H-9): memo evita que actualizar una fila re-renderice las
// demás — solo tiene efecto real porque actualizarEstadoFila (Viajes.tsx) está envuelta en
// useCallback (referencia estable) y viaje conserva su referencia para las filas no tocadas
// (Viajes.tsx: actualizarEstadoFila hace .map() devolviendo la misma referencia salvo para la
// fila cuyo id coincide).
export default memo(FilaViaje);
