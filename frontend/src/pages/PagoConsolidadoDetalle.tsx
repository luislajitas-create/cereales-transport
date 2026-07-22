import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useAsyncAction } from "../hooks/useAsyncAction";

interface Grupo {
  id: string;
  nombre: string;
  organizaciones: { id: string; nombre: string }[];
}

interface Identidad {
  id: string;
  nombreReferencia: string;
}

interface FilaPago {
  id: string;
  organizacionId: string;
  liquidacionId: string;
  subtotalNetoPagar: number;
  estadoAplicacion: string;
}

interface Pago {
  id: string;
  identidadChoferGrupoId: string;
  estado: string;
  totalConsolidado: number;
  referenciaPago: string | null;
  canceladoMotivo: string | null;
  createdAt: string;
  liquidaciones: FilaPago[];
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// Bloque 10.6 — DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md, secciones 8/9/10/11/12:
// las acciones disponibles dependen exclusivamente del `estado` real del pago (nunca un estado
// de interfaz propio); confirmar() puede devolver 201 con CONFIRMADO/PARCIAL/FALLIDO — un éxito
// HTTP no es un éxito de negocio, cada resultado tiene su propio tratamiento visual; toda acción
// vuelve a consultar el pago después, nunca asume que la respuesta de la acción ya es el estado
// final a mostrar.
export default function PagoConsolidadoDetalle() {
  const { id: pagoId } = useParams<{ id: string }>();
  const { usuario } = useAuth();
  const confirm = useConfirm();

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [identidad, setIdentidad] = useState<Identidad | null>(null);
  const [cargandoIdentidad, setCargandoIdentidad] = useState(false);
  const [errorIdentidad, setErrorIdentidad] = useState("");

  const [resultadoBanner, setResultadoBanner] = useState<{ tipo: "confirmado" | "parcial" | "fallido"; texto: string } | null>(null);
  const [actualizando, setActualizando] = useState(false);

  const prepararAccion = useAsyncAction();
  const confirmarAccion = useAsyncAction();
  const cancelarAccion = useAsyncAction();

  // Descarta respuestas de GET .../pagos-consolidados/:pagoId (o de la identidad del
  // beneficiario) que resuelvan fuera de orden — por ejemplo, dos clics en "Actualizar", o una
  // recarga manual solapada con la recarga automática tras una acción — solo la respuesta de la
  // solicitud más reciente de cada una se aplica.
  const pagoRequestIdRef = useRef(0);
  const identidadRequestIdRef = useRef(0);

  function cargarGrupo() {
    return api.get("/grupo-economico").then((res) => setGrupo(res.data));
  }

  function cargarPago(): Promise<Pago | null> {
    if (!grupo || !pagoId) return Promise.resolve(null);
    const requestId = ++pagoRequestIdRef.current;
    return api.get(`/grupo-economico/${grupo.id}/pagos-consolidados/${pagoId}`).then((res) => {
      if (requestId !== pagoRequestIdRef.current) return null;
      setPago(res.data);
      return res.data as Pago;
    });
  }

  // Reutilizada por el useEffect que carga la identidad al entrar/cambiar de pago, y por
  // recargarPago() — el botón "Actualizar" debe poder reintentar también la identidad, no solo
  // el pago: identidadChoferGrupoId no cambia entre recargas del mismo pago, así que el
  // useEffect de abajo (que depende de ese valor) no se vuelve a disparar solo.
  function cargarIdentidad(pagoActual: Pago) {
    const requestId = ++identidadRequestIdRef.current;
    setCargandoIdentidad(true);
    setErrorIdentidad("");
    return api
      .get(`/grupo-economico/choferes/identidades/${pagoActual.identidadChoferGrupoId}`)
      .then((res) => {
        if (requestId === identidadRequestIdRef.current) setIdentidad(res.data);
      })
      .catch((err) => {
        if (requestId === identidadRequestIdRef.current) {
          setIdentidad(null);
          setErrorIdentidad(err?.response?.data?.message || "No se pudo obtener el nombre del beneficiario.");
        }
      })
      .finally(() => {
        if (requestId === identidadRequestIdRef.current) setCargandoIdentidad(false);
      });
  }

  useEffect(() => {
    if (usuario?.rol !== "ADMINISTRADOR") return;
    let cancelado = false;
    setCargando(true);
    setErrorCarga("");
    cargarGrupo()
      .catch((err) => {
        if (!cancelado) setErrorCarga(err?.response?.data?.message || "No se pudo cargar el grupo económico.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);

  useEffect(() => {
    if (!grupo || !pagoId) return;
    let cancelado = false;
    setCargando(true);
    setErrorCarga("");
    cargarPago()
      .catch((err) => {
        if (!cancelado) setErrorCarga(err?.response?.data?.message || "No se pudo cargar el pago consolidado.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo, pagoId]);

  useEffect(() => {
    if (!grupo || !pago) return;
    setIdentidad(null);
    cargarIdentidad(pago);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo, pago?.identidadChoferGrupoId]);

  function nombreOrganizacion(organizacionId: string) {
    return grupo?.organizaciones.find((o) => o.id === organizacionId)?.nombre || "Organización no disponible";
  }

  async function recargarPago() {
    if (actualizando) return;
    setActualizando(true);
    try {
      const data = await cargarPago();
      if (data) await cargarIdentidad(data);
    } catch {
      // ya manejado por errorCarga en la carga inicial; una recarga manual fallida deja el
      // último estado conocido visible, sin ningún mensaje adicional (mismo criterio ya
      // aceptado para esta acción).
    } finally {
      setActualizando(false);
    }
  }

  // Limpia, al comenzar cualquier acción de ciclo de vida, los banners de las otras acciones
  // — evita que un error/éxito de una acción anterior (por ejemplo, un "Preparar" fallido)
  // quede visible junto al resultado de una acción distinta que se ejecuta después.
  function limpiarBanners() {
    setResultadoBanner(null);
    prepararAccion.setError("");
    prepararAccion.setSuccess("");
    confirmarAccion.setError("");
    confirmarAccion.setSuccess("");
    cancelarAccion.setError("");
    cancelarAccion.setSuccess("");
  }

  async function preparar() {
    if (!grupo || !pago) return;
    const { confirmed } = await confirm({
      title: "Preparar pago consolidado",
      message: "¿Preparar este pago? Se bloquearán las liquidaciones seleccionadas en todas las organizaciones involucradas.",
      severity: "medium",
      confirmLabel: "Preparar",
    });
    if (!confirmed) return;
    limpiarBanners();
    prepararAccion.run(
      async () => {
        await api.post(`/grupo-economico/${grupo.id}/pagos-consolidados/${pago.id}/preparar`, {});
        await recargarPago();
      },
      { successMessage: "Pago preparado — liquidaciones bloqueadas.", errorMessage: "No se pudo preparar el pago." },
    );
  }

  async function confirmarOReintentar() {
    if (!grupo || !pago || !identidad) return;
    const esReintento = pago.estado === "PARCIAL" || pago.estado === "FALLIDO";
    const { confirmed } = await confirm({
      title: esReintento ? "Reintentar confirmación" : "Confirmar pago consolidado",
      message: `¿${esReintento ? "Reintentar la aplicación de" : "Aplicar"} el pago de ${fmtMoney(pago.totalConsolidado)} a ${identidad.nombreReferencia}? Esta acción no se puede deshacer y puede aplicarse parcialmente entre organizaciones.`,
      severity: "high",
      requireTypedValue: identidad.nombreReferencia,
      typedValueLabel: `Escribí "${identidad.nombreReferencia}" para confirmar`,
      confirmLabel: esReintento ? "Reintentar" : "Confirmar",
    });
    if (!confirmed) return;
    limpiarBanners();
    confirmarAccion.run(async () => {
      const { data } = await api.post(`/grupo-economico/${grupo.id}/pagos-consolidados/${pago.id}/confirmar`, {});
      await recargarPago();
      if (data.estado === "CONFIRMADO") {
        setResultadoBanner({ tipo: "confirmado", texto: "Pago confirmado — aplicado por completo en todas las organizaciones." });
      } else if (data.estado === "PARCIAL") {
        setResultadoBanner({
          tipo: "parcial",
          texto: "Resultado parcial: no es un error del sistema. Algunas organizaciones se aplicaron y otras quedaron pendientes — revisá el desglose y reintentá cuando quieras.",
        });
      } else if (data.estado === "FALLIDO") {
        setResultadoBanner({
          tipo: "fallido",
          texto: "Ninguna organización se aplicó todavía. Podés reintentar o cancelar el pago.",
        });
      }
    });
  }

  async function cancelar() {
    if (!grupo || !pago) return;
    const { confirmed, motivo } = await confirm({
      title: "Cancelar pago consolidado",
      message: "¿Cancelar este pago consolidado? Se liberarán las liquidaciones bloqueadas.",
      severity: "medium",
      requireMotivo: true,
      confirmLabel: "Cancelar pago",
    });
    if (!confirmed) return;
    limpiarBanners();
    cancelarAccion.run(
      async () => {
        await api.post(`/grupo-economico/${grupo.id}/pagos-consolidados/${pago.id}/cancelar`, { motivo });
        await recargarPago();
      },
      { successMessage: "Pago consolidado cancelado.", errorMessage: "No se pudo cancelar el pago." },
    );
  }

  if (usuario?.rol !== "ADMINISTRADOR") {
    return (
      <div>
        <div className="page-header"><h1>Pago consolidado</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  if (cargando) {
    return (
      <div>
        <div className="page-header"><h1>Pago consolidado</h1></div>
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div>
        <div className="page-header"><h1>Pago consolidado</h1></div>
        <div className="error-banner">{errorCarga}</div>
      </div>
    );
  }

  if (!grupo) {
    return (
      <div>
        <div className="page-header"><h1>Pago consolidado</h1></div>
        <p className="muted">Tu organización no pertenece a ningún grupo económico.</p>
      </div>
    );
  }

  // Sí es alcanzable, contra lo que parecía por análisis estático: el efecto que carga `grupo`
  // hace setGrupo()+setCargando(false) en el mismo ciclo, produciendo un render intermedio con
  // cargando=false, grupo ya presente y pago todavía null — antes de que el efecto dependiente
  // de `grupo` alcance a volver a poner cargando=true para cargar el pago. Confirmado por
  // reproducción real (pantalla en blanco con TypeError "Cannot read properties of null
  // (reading 'estado')") al retirar esta guarda — se restaura.
  if (!pago) {
    return (
      <div>
        <div className="page-header"><h1>Pago consolidado</h1></div>
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  const busy = prepararAccion.busy || confirmarAccion.busy || cancelarAccion.busy;
  const puedePreparar = pago.estado === "BORRADOR";
  const puedeConfirmar = pago.estado === "PREPARADO" || pago.estado === "PARCIAL" || pago.estado === "FALLIDO";
  const puedeCancelar = pago.estado === "BORRADOR" || pago.estado === "PREPARADO" || pago.estado === "FALLIDO";
  const esReintento = pago.estado === "PARCIAL" || pago.estado === "FALLIDO";

  return (
    <div>
      <div className="page-header">
        <h1>Pago consolidado — {identidad?.nombreReferencia || "Beneficiario"}</h1>
        <span className={`badge ${pago.estado}`}>{pago.estado}</span>
      </div>

      {resultadoBanner && (
        <div className={resultadoBanner.tipo === "confirmado" ? "success-banner" : "warning-banner"}>
          {resultadoBanner.texto}
        </div>
      )}
      {prepararAccion.error && <div className="error-banner">{prepararAccion.error}</div>}
      {prepararAccion.success && <div className="success-banner">{prepararAccion.success}</div>}
      {confirmarAccion.error && <div className="error-banner">{confirmarAccion.error}</div>}
      {cancelarAccion.error && <div className="error-banner">{cancelarAccion.error}</div>}
      {cancelarAccion.success && <div className="success-banner">{cancelarAccion.success}</div>}

      {pago.estado === "PROCESANDO" && (
        <div className="error-banner">
          Este pago está siendo procesado. No hay ninguna acción disponible mientras dure — actualizá para ver el estado más reciente.
        </div>
      )}

      <div className="card">
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="label">Total consolidado</div>
            <div className="value">{fmtMoney(pago.totalConsolidado)}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Referencia</div>
            <div className="value" style={{ fontSize: "1.15rem" }}>{pago.referenciaPago || "—"}</div>
          </div>
          <div className="kpi-card">
            <div className="label">Creado</div>
            <div className="value" style={{ fontSize: "1.15rem" }}>{new Date(pago.createdAt).toLocaleString()}</div>
          </div>
          {pago.estado === "CANCELADO" && pago.canceladoMotivo && (
            <div className="kpi-card">
              <div className="label">Motivo de cancelación</div>
              <div className="value" style={{ fontSize: "1.15rem" }}>{pago.canceladoMotivo}</div>
            </div>
          )}
        </div>

        <div className="section-title">Desglose por organización</div>
        <table>
          <thead>
            <tr>
              <th>Organización</th>
              <th className="num">Neto a pagar</th>
              <th>Estado de aplicación</th>
            </tr>
          </thead>
          <tbody>
            {pago.liquidaciones.map((fila) => (
              <tr key={fila.id}>
                <td>{nombreOrganizacion(fila.organizacionId)}</td>
                <td className="num">{fmtMoney(fila.subtotalNetoPagar)}</td>
                <td><span className={`badge ${fila.estadoAplicacion}`}>{fila.estadoAplicacion}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {puedeConfirmar && errorIdentidad && (
          <div className="error-banner">
            No se pudo obtener el nombre del beneficiario ({errorIdentidad}) — {esReintento ? "Reintentar" : "Confirmar"} permanece deshabilitado hasta poder resolverlo. Probá con "Actualizar".
          </div>
        )}

        <div className="actions-row">
          <button className="btn secondary" disabled={busy || actualizando} onClick={recargarPago}>
            {actualizando ? "Actualizando..." : "Actualizar"}
          </button>
          {puedePreparar && (
            <button className="btn success" disabled={busy} onClick={preparar}>
              {prepararAccion.busy ? "Preparando..." : "Preparar"}
            </button>
          )}
          {puedeConfirmar && (
            <button
              className="btn success"
              disabled={busy || cargandoIdentidad || !identidad}
              onClick={confirmarOReintentar}
            >
              {confirmarAccion.busy
                ? "Aplicando..."
                : cargandoIdentidad
                  ? "Resolviendo beneficiario..."
                  : esReintento
                    ? "Reintentar"
                    : "Confirmar"}
            </button>
          )}
          {puedeCancelar && (
            <button className="btn danger" disabled={busy} onClick={cancelar}>
              {cancelarAccion.busy ? "Cancelando..." : "Cancelar pago"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
