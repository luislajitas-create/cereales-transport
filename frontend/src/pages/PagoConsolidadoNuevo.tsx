import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

interface Grupo {
  id: string;
  nombre: string;
  organizaciones: { id: string; nombre: string }[];
}

interface Identidad {
  id: string;
  nombreReferencia: string;
}

interface Candidato {
  id: string;
  numero: number;
  periodoDesde: string;
  periodoHasta: string;
  netoPagar: number;
  organizacionId: string;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// Bloque 10.6 — DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md, sección 7 (flujo de
// creación) y sección 21 (persistencia del estado de creación): elegir un beneficiario distinto
// reinicia candidatos, selección y referenciaPago por completo — un fallo de crear() (red o
// rechazo del backend) NUNCA limpia el formulario, y no se re-consulta candidatos
// automáticamente tras un fallo.
export default function PagoConsolidadoNuevo() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const crearAccion = useAsyncAction();

  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [errorInicial, setErrorInicial] = useState("");
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [identidades, setIdentidades] = useState<Identidad[]>([]);

  const [identidadChoferGrupoId, setIdentidadChoferGrupoId] = useState("");
  const [cargandoCandidatos, setCargandoCandidatos] = useState(false);
  const [errorCandidatos, setErrorCandidatos] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [referenciaPago, setReferenciaPago] = useState("");
  const beneficiarioEnCursoRef = useRef("");

  useUnsavedChangesGuard(seleccion.size > 0);

  useEffect(() => {
    if (usuario?.rol !== "ADMINISTRADOR") return;
    let cancelado = false;
    setCargandoInicial(true);
    setErrorInicial("");
    Promise.all([api.get("/grupo-economico"), api.get("/grupo-economico/choferes/identidades")])
      .then(([grupoRes, identidadesRes]) => {
        if (cancelado) return;
        setGrupo(grupoRes.data);
        setIdentidades(identidadesRes.data);
      })
      .catch((err) => {
        if (!cancelado) setErrorInicial(err?.response?.data?.message || "No se pudo cargar el grupo económico.");
      })
      .finally(() => {
        if (!cancelado) setCargandoInicial(false);
      });
    return () => {
      cancelado = true;
    };
  }, [usuario]);

  function elegirBeneficiario(id: string) {
    // Sección 21: cambiar de beneficiario es, a todos los efectos, empezar un borrador nuevo.
    setIdentidadChoferGrupoId(id);
    setCandidatos([]);
    setSeleccion(new Set());
    setReferenciaPago("");
    setErrorCandidatos("");
    // Descarta una respuesta atrasada de un beneficiario elegido anteriormente si, mientras
    // esa consulta seguía en curso, el usuario ya cambió a otro — mismo criterio de "última
    // solicitud gana" que la bandera `cancelado` de los useEffect de carga, adaptado acá para
    // un manejador de evento (no hay cleanup de useEffect que lo dispare).
    beneficiarioEnCursoRef.current = id;
    if (!id || !grupo) return;
    setCargandoCandidatos(true);
    api
      .get(`/grupo-economico/${grupo.id}/pagos-consolidados/candidatos`, { params: { identidadChoferGrupoId: id } })
      .then((res) => {
        if (beneficiarioEnCursoRef.current === id) setCandidatos(res.data);
      })
      .catch((err) => {
        if (beneficiarioEnCursoRef.current === id) {
          setErrorCandidatos(err?.response?.data?.message || "No se pudieron cargar las liquidaciones candidatas.");
        }
      })
      .finally(() => {
        if (beneficiarioEnCursoRef.current === id) setCargandoCandidatos(false);
      });
  }

  function toggle(id: string) {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSeleccion(next);
  }

  function nombreOrganizacion(organizacionId: string) {
    return grupo?.organizaciones.find((o) => o.id === organizacionId)?.nombre || "Organización no disponible";
  }

  const seleccionados = candidatos.filter((c) => seleccion.has(c.id));
  const totalSeleccionado = seleccionados.reduce((acc, c) => acc + c.netoPagar, 0);
  const subtotalesPorOrganizacion = Array.from(new Set(seleccionados.map((c) => c.organizacionId))).map((organizacionId) => ({
    organizacionId,
    total: seleccionados.filter((c) => c.organizacionId === organizacionId).reduce((acc, c) => acc + c.netoPagar, 0),
  }));

  function crear() {
    if (!grupo || seleccion.size === 0) return;
    crearAccion.run(
      async () => {
        const { data } = await api.post(`/grupo-economico/${grupo.id}/pagos-consolidados`, {
          identidadChoferGrupoId,
          items: seleccionados.map((c) => ({ organizacionId: c.organizacionId, liquidacionId: c.id })),
          referenciaPago: referenciaPago.trim() || undefined,
        });
        navigate(`/administracion/pago-consolidado/${data.id}`);
      },
      { errorMessage: "No se pudo crear el pago consolidado." },
    );
  }

  if (usuario?.rol !== "ADMINISTRADOR") {
    return (
      <div>
        <div className="page-header"><h1>Nuevo pago consolidado</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  if (cargandoInicial) {
    return (
      <div>
        <div className="page-header"><h1>Nuevo pago consolidado</h1></div>
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  if (errorInicial) {
    return (
      <div>
        <div className="page-header"><h1>Nuevo pago consolidado</h1></div>
        <div className="error-banner">{errorInicial}</div>
      </div>
    );
  }

  if (!grupo) {
    return (
      <div>
        <div className="page-header"><h1>Nuevo pago consolidado</h1></div>
        <p className="muted">Tu organización no pertenece a ningún grupo económico.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header"><h1>Nuevo pago consolidado</h1></div>
      {crearAccion.error && <div className="error-banner">{crearAccion.error}</div>}

      <div className="card">
        <div className="section-title">Beneficiario</div>
        <div className="form-grid">
          <div className="field">
            <label>Identidad de chofer</label>
            <select value={identidadChoferGrupoId} onChange={(e) => elegirBeneficiario(e.target.value)}>
              <option value="">Seleccionar...</option>
              {identidades.map((i) => (
                <option key={i.id} value={i.id}>{i.nombreReferencia}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {identidadChoferGrupoId && (
        <div className="card">
          <div className="section-title">Liquidaciones candidatas</div>
          {errorCandidatos && <div className="error-banner">{errorCandidatos}</div>}
          {cargandoCandidatos && <p className="muted">Cargando...</p>}
          {!cargandoCandidatos && !errorCandidatos && candidatos.length === 0 && (
            <p className="muted">Este beneficiario no tiene liquidaciones candidatas en ninguna organización.</p>
          )}
          {!cargandoCandidatos && candidatos.length > 0 && (
            <>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>N°</th>
                    <th>Organización</th>
                    <th>Período</th>
                    <th className="num">Neto a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {candidatos.map((c) => (
                    <tr key={c.id}>
                      <td><input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggle(c.id)} /></td>
                      <td>{c.numero}</td>
                      <td>{nombreOrganizacion(c.organizacionId)}</td>
                      <td>{new Date(c.periodoDesde).toLocaleDateString()} → {new Date(c.periodoHasta).toLocaleDateString()}</td>
                      <td className="num">{fmtMoney(c.netoPagar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {subtotalesPorOrganizacion.length > 0 && (
                <p className="muted">
                  {subtotalesPorOrganizacion.map((s) => `${nombreOrganizacion(s.organizacionId)}: ${fmtMoney(s.total)}`).join(" · ")}
                  {" · "}Total: {fmtMoney(totalSeleccionado)}
                </p>
              )}

              <div className="form-grid">
                <div className="field">
                  <label>Referencia (opcional)</label>
                  <input value={referenciaPago} onChange={(e) => setReferenciaPago(e.target.value)} disabled={crearAccion.busy} />
                </div>
              </div>

              <div className="actions-row">
                <button className="btn" disabled={seleccion.size === 0 || crearAccion.busy} onClick={crear}>
                  {crearAccion.busy ? "Creando..." : "Crear pago consolidado (borrador)"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
