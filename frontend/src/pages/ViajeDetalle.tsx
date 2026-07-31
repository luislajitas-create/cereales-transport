import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";

const ORDEN_ESTADOS = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function ViajeDetalle() {
  const { id } = useParams();
  const location = useLocation();
  const confirm = useConfirm();
  const [viaje, setViaje] = useState<any>(null);
  const [error, setError] = useState("");
  // UX Refinement (First Trip): "creado" viaja como state de navegación (no persistido, no
  // querystring) desde ViajeForm.tsx tras el POST — se lee una sola vez al montar. Un refresh
  // de esta pantalla pierde el state (comportamiento esperado de history.state) y el mensaje
  // no reaparece, que es lo que se quiere: es un aviso de "recién creado", no un estado del Viaje.
  const [success, setSuccess] = useState(location.state?.creado ? "✅ Viaje creado correctamente." : "");
  const [busy, setBusy] = useState(false);
  // Listado Operativo, Bloque L3 (AUDITORIA_DISENO_VIAJES2.0_L3_PERSISTENCIA_LISTADO.md, v1):
  // Viajes.tsx pasa la URL exacta desde la que se navegó (con filtros/búsqueda) como state al
  // entrar acá. Si no existe (acceso directo, o el state se perdió en un refresh), cae a /viajes
  // sin filtros — mismo comportamiento que hoy, no una regresión.
  const volverA = location.state?.volverA || "/viajes";

  function cargar() {
    api.get(`/viajes/${id}`).then((res) => setViaje(res.data)).catch(() => setError("No se pudo cargar el viaje"));
  }

  useEffect(() => { cargar(); }, [id]);

  async function avanzarEstado() {
    if (!viaje) return;
    const idx = ORDEN_ESTADOS.indexOf(viaje.estado);
    const siguiente = ORDEN_ESTADOS[idx + 1];
    if (!siguiente) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/viajes/${id}/estado`, { estado: siguiente });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cambiar el estado");
    } finally {
      setBusy(false);
    }
  }

  async function cancelarViaje() {
    if (!viaje) return;
    const ok = await confirm({
      title: "Cancelar viaje",
      message: `¿Cancelar el viaje N° ${viaje.numeroViaje}?`,
      requireMotivo: true,
      confirmLabel: "Cancelar viaje",
    });
    if (!ok.confirmed) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.post(`/viajes/${id}/cancelar`, { motivo: ok.motivo });
      setSuccess(`Viaje N° ${viaje.numeroViaje} cancelado.`);
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cancelar el viaje");
    } finally {
      setBusy(false);
    }
  }

  if (error && !viaje) return <div className="error-banner">{error}</div>;
  if (!viaje) return <div className="muted">Cargando...</div>;

  const idx = ORDEN_ESTADOS.indexOf(viaje.estado);
  const siguienteEstado = idx >= 0 && idx < ORDEN_ESTADOS.length - 1 ? ORDEN_ESTADOS[idx + 1] : null;

  return (
    <div>
      <p style={{ marginBottom: "0.6rem" }}>
        <Link to={volverA}>← Volver al listado</Link>
      </p>
      <div className="page-header">
        <h1>Viaje N° {viaje.numeroViaje}</h1>
        <span className={`badge ${viaje.estado}`}>{viaje.estado}</span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <div className="form-grid">
          <div><strong>Fecha:</strong> {new Date(viaje.fecha).toLocaleDateString()}</div>
          <div><strong>CTG:</strong> {viaje.ctg}</div>
          <div><strong>Carta de porte:</strong> {viaje.cartaPorte}</div>
          <div><strong>Cereal:</strong> {viaje.cereal?.nombre}</div>
          <div><strong>Cliente:</strong> {viaje.cliente?.razonSocial}</div>
          <div><strong>Productor:</strong> {viaje.productor?.nombre || "—"}</div>
          <div><strong>Transportista:</strong> {viaje.transportista?.razonSocial}</div>
          <div><strong>Chofer:</strong> {viaje.chofer?.nombre}</div>
          <div><strong>Camión / Acoplado:</strong> {viaje.camion?.patente} {viaje.acoplado ? `/ ${viaje.acoplado.patente}` : ""}</div>
          <div><strong>Origen → Destino:</strong> {viaje.origen?.nombre} → {viaje.destino?.nombre}</div>
          <div><strong>Toneladas:</strong> {viaje.toneladas}</div>
          <div><strong>Tarifa/tn:</strong> {fmtMoney(viaje.tarifaTonelada)}</div>
          <div><strong>Importe total:</strong> {fmtMoney(viaje.importeTotal)}</div>
          <div><strong>Estado facturación:</strong> <span className={`badge ${viaje.estadoFacturacion}`}>{viaje.estadoFacturacion}</span></div>
          <div><strong>Estado liquidación:</strong> {viaje.estadoLiquidacion}</div>
        </div>
        {viaje.observaciones && <p className="muted">Obs: {viaje.observaciones}</p>}

        <div className="actions-row">
          {/* Núcleo Viajes 2.0, Tarea 4: siempre visible, sin condicionar por estado — el
              backend permite editar "observaciones"/"productorId" incluso con el viaje
              CANCELADO o ya facturado/liquidado (ver update() en viajes.controller.ts); los
              demás campos quedan bloqueados ahí mismo, con el mensaje explicando el motivo. */}
          {/* Bloque L3 (ajuste): retransmite el mismo volverA que este Detalle recibió, para que
              ViajeForm.tsx pueda devolverlo intacto al guardar y volver acá. */}
          <Link className="btn secondary" to={`/viajes/${id}/editar`} state={{ volverA }}>Editar viaje</Link>
          {/* Sub-bloque L4.2 (AUDITORIA_DISENO_VIAJES2.0_L4.2_CANCELAR_LISTADO.md, Decisión A):
              el backend nunca bloqueó cancelar un DESCARGADO por ese solo motivo — solo bloquea
              si ya está facturado o liquidado (assertCancelacionPermitida), con su propio mensaje
              explicativo. La condición "!== DESCARGADO" era una restricción extra del frontend,
              sin respaldo en el backend; se quita para alinear la UI a la regla real. "Avanzar a
              X" no se ve afectado: siguienteEstado ya es null para DESCARGADO (es el último
              estado de ORDEN_ESTADOS), así que ese botón sigue sin aparecer ahí, sin necesidad de
              una condición aparte. */}
          {viaje.estado !== "CANCELADO" && (
            <>
              {siguienteEstado && (
                <button className="btn success" disabled={busy} onClick={avanzarEstado}>
                  Avanzar a {siguienteEstado}
                </button>
              )}
              <button className="btn danger" disabled={busy} onClick={cancelarViaje}>Cancelar viaje</button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Historial de estados</div>
        <table>
          <thead><tr><th>Fecha</th><th>Estado anterior</th><th>Estado nuevo</th><th>Usuario</th></tr></thead>
          <tbody>
            {viaje.historial?.map((h: any) => (
              <tr key={h.id}>
                <td>{new Date(h.fecha).toLocaleString()}</td>
                <td>{h.estadoAnterior || "—"}</td>
                <td>{h.estadoNuevo}</td>
                <td>{h.usuario?.nombre || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viaje.anticipos?.length > 0 && (
        <div className="card">
          <div className="section-title">Anticipos / gastos asociados</div>
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Liquidado</th></tr></thead>
            <tbody>
              {viaje.anticipos.map((a: any) => (
                <tr key={a.id}>
                  <td>{new Date(a.fecha).toLocaleDateString()}</td>
                  <td>{a.tipoGasto?.nombre}</td>
                  <td>{fmtMoney(a.importe)}</td>
                  <td>{a.liquidado ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
