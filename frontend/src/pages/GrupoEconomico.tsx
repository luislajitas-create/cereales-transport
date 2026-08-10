import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useConfirm } from "../components/ConfirmDialog";
import { esFormatoCodigoGrupoValido, normalizarCodigoGrupo, validarNombreGrupo } from "./grupo-economico-payload";

interface Grupo {
  id: string;
  nombre: string;
  organizaciones: { id: string; nombre: string }[];
}

interface Acceso {
  id: string;
  usuarioId: string;
  otorgadoPorId: string;
  createdAt: string;
}

interface Candidato {
  id: string;
  nombre: string;
  email: string;
  organizacionId: string;
  nombreOrganizacion: string;
}

export default function GrupoEconomico() {
  const { usuario } = useAuth();
  const confirm = useConfirm();

  const [cargandoGrupo, setCargandoGrupo] = useState(true);
  const [errorGrupo, setErrorGrupo] = useState("");
  const [grupo, setGrupo] = useState<Grupo | null>(null);

  const [cargandoAccesos, setCargandoAccesos] = useState(false);
  const [errorAccesos, setErrorAccesos] = useState("");
  const [accesos, setAccesos] = useState<Acceso[]>([]);

  // Bloque 10.4.c — enriquecimiento del listado (DISENO_BLOQUE10.4c.md, sección 7): null marca
  // explícitamente "no resoluble" (Decisión Técnica 3 de DECISIONES_TECNICAS_BLOQUE10.4c.md, se
  // muestra "Usuario no disponible"); la ausencia de la clave marca "todavía no se intentó".
  const [enriquecidos, setEnriquecidos] = useState<Record<string, Candidato | null>>({});

  const [email, setEmail] = useState("");
  const [candidato, setCandidato] = useState<Candidato | null>(null);

  const resolverAccion = useAsyncAction();
  const otorgarAccion = useAsyncAction();
  const filaAccion = useAsyncAction();

  // GAP-GE-1 — crear un grupo nuevo o unirse a uno existente (única vía hasta ahora era API
  // directa: el backend ya soportaba esto desde el Bloque 10.1, sin ningún control en esta
  // pantalla). Dos acciones independientes porque solo una de las dos puede tener sentido en un
  // momento dado (la organización actual no pertenece a ningún grupo todavía).
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [errorNombreGrupo, setErrorNombreGrupo] = useState("");
  const crearGrupoAccion = useAsyncAction();

  const [codigoUnirse, setCodigoUnirse] = useState("");
  const [errorCodigoUnirse, setErrorCodigoUnirse] = useState("");
  const unirseAccion = useAsyncAction();

  // "Código del Grupo Económico" en la UI es el id real del grupo (el backend no tiene otro
  // identificador) — nunca se lo llama "id"/"UUID" ni se persiste en localStorage/sessionStorage,
  // ni se registra en consola. Es una credencial operativa permanente (no una invitación
  // temporal ni revocable con el diseño actual) — mismo criterio de manejo que un password.
  const [copiado, setCopiado] = useState(false);
  const [errorCopiado, setErrorCopiado] = useState("");
  const copiadoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current);
    };
  }, []);

  function cargarGrupo() {
    setCargandoGrupo(true);
    setErrorGrupo("");
    api
      .get("/grupo-economico")
      .then((res) => setGrupo(res.data))
      .catch((err) => {
        setErrorGrupo(err?.response?.data?.message || "No se pudo cargar el grupo económico.");
      })
      .finally(() => setCargandoGrupo(false));
  }

  useEffect(() => {
    // Mismo criterio que Usuarios.tsx/AuditoriaAdministrativa.tsx: la pantalla completa es
    // exclusiva de ADMINISTRADOR, así que ni siquiera se consulta el backend para otro rol.
    if (usuario?.rol === "ADMINISTRADOR") cargarGrupo();
  }, [usuario]);

  function cargarAccesos(grupoId: string) {
    setCargandoAccesos(true);
    setErrorAccesos("");
    api
      .get(`/grupo-economico/${grupoId}/accesos`)
      .then((res) => setAccesos(res.data))
      .catch((err) => {
        setErrorAccesos(err?.response?.data?.message || "No se pudo cargar el listado de accesos.");
      })
      .finally(() => setCargandoAccesos(false));
  }

  useEffect(() => {
    if (grupo) cargarAccesos(grupo.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupo?.id]);

  useEffect(() => {
    if (!grupo) return;
    const pendientes = Array.from(new Set(accesos.map((a) => a.usuarioId))).filter(
      (id) => !(id in enriquecidos),
    );
    if (pendientes.length === 0) return;
    let cancelado = false;
    pendientes.forEach((usuarioId) => {
      api
        .get(`/grupo-economico/${grupo.id}/usuarios/resolver`, { params: { usuarioId } })
        .then((res) => {
          if (!cancelado) setEnriquecidos((prev) => ({ ...prev, [usuarioId]: res.data }));
        })
        .catch(() => {
          if (!cancelado) setEnriquecidos((prev) => ({ ...prev, [usuarioId]: null }));
        });
    });
    return () => {
      cancelado = true;
    };
    // enriquecidos deliberadamente afuera de las dependencias: si se incluyera, cada resolución
    // individual dispararía una re-ejecución del efecto que volvería a lanzar una llamada
    // duplicada por cada usuarioId todavía pendiente en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accesos, grupo]);

  async function handleCrearGrupo(e: React.FormEvent) {
    e.preventDefault();
    const errorValidacion = validarNombreGrupo(nombreGrupo);
    if (errorValidacion) {
      setErrorNombreGrupo(errorValidacion);
      return;
    }
    setErrorNombreGrupo("");
    const { confirmed } = await confirm({
      title: "Crear Grupo Económico",
      message: `Se va a crear el grupo "${nombreGrupo.trim()}" y tu organización va a quedar como su primera integrante.`,
      severity: "medium",
    });
    if (!confirmed) return;
    crearGrupoAccion.run(
      async () => {
        const { data } = await api.post("/grupo-economico", { nombre: nombreGrupo.trim() });
        setGrupo(data);
        setNombreGrupo("");
      },
      { successMessage: "Grupo económico creado." },
    );
  }

  async function handleUnirseGrupo(e: React.FormEvent) {
    e.preventDefault();
    const codigo = normalizarCodigoGrupo(codigoUnirse);
    if (!esFormatoCodigoGrupoValido(codigo)) {
      setErrorCodigoUnirse("El código no tiene el formato esperado. Verificá que lo copiaste completo.");
      return;
    }
    setErrorCodigoUnirse("");
    const { confirmed } = await confirm({
      title: "Unirse a un Grupo Económico",
      message: "Tu organización actual se va a incorporar a este grupo económico. Pedile el código al administrador de la otra organización antes de confirmar.",
      severity: "medium",
    });
    if (!confirmed) return;
    unirseAccion.run(
      async () => {
        const { data } = await api.post(`/grupo-economico/${encodeURIComponent(codigo)}/organizaciones`);
        setGrupo(data);
        setCodigoUnirse("");
      },
      { successMessage: "Tu organización se unió al grupo económico." },
    );
  }

  function copiarCodigo() {
    if (!grupo) return;
    navigator.clipboard
      .writeText(grupo.id)
      .then(() => {
        setErrorCopiado("");
        setCopiado(true);
        if (copiadoTimeout.current) clearTimeout(copiadoTimeout.current);
        copiadoTimeout.current = setTimeout(() => setCopiado(false), 2000);
      })
      .catch(() => {
        // Nunca se loguea el código acá — el mensaje es genérico a propósito.
        setCopiado(false);
        setErrorCopiado("No se pudo copiar automáticamente. Seleccioná y copiá el código manualmente.");
      });
  }

  function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    if (!grupo) return;
    setCandidato(null);
    resolverAccion.run(async () => {
      const { data } = await api.get(`/grupo-economico/${grupo.id}/usuarios/resolver`, { params: { email } });
      setCandidato(data);
    });
  }

  async function handleOtorgar() {
    if (!candidato || !grupo) return;
    const { confirmed } = await confirm({
      title: "Otorgar acceso",
      message: `¿Otorgar acceso a ${candidato.nombre} (${candidato.nombreOrganizacion})?`,
      severity: "medium",
    });
    if (!confirmed) return;
    otorgarAccion.run(
      async () => {
        await api.post(`/grupo-economico/${grupo.id}/accesos`, { usuarioId: candidato.id });
        setEmail("");
        setCandidato(null);
        cargarAccesos(grupo.id);
      },
      { successMessage: "Acceso otorgado." },
    );
  }

  async function handleRevocar(acceso: Acceso) {
    if (!grupo) return;
    const nombre = enriquecidos[acceso.usuarioId]?.nombre;
    const { confirmed } = await confirm({
      title: "Revocar acceso",
      message: nombre ? `¿Revocar el acceso de ${nombre}?` : "¿Revocar este acceso?",
      confirmLabel: "Revocar",
      severity: "high",
    });
    if (!confirmed) return;
    filaAccion.run(
      async () => {
        await api.delete(`/grupo-economico/${grupo.id}/accesos/${acceso.id}`);
        cargarAccesos(grupo.id);
      },
      { successMessage: "Acceso revocado." },
    );
  }

  function otorgadoPor(acceso: Acceso) {
    return acceso.otorgadoPorId === usuario?.id ? "Vos" : "Otro administrador de tu organización";
  }

  function destinatario(acceso: Acceso) {
    if (!(acceso.usuarioId in enriquecidos)) return "Resolviendo...";
    const resuelto = enriquecidos[acceso.usuarioId];
    if (resuelto === null) return "Usuario no disponible";
    return `${resuelto.nombre} (${resuelto.nombreOrganizacion})`;
  }

  // El guard por rol vive ahora en <ProtectedRoute> (App.tsx) — esta pantalla ya no monta si
  // el rol no es ADMINISTRADOR.

  if (cargandoGrupo) {
    return (
      <div>
        <div className="page-header"><h1>Grupo Económico</h1></div>
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  if (errorGrupo) {
    return (
      <div>
        <div className="page-header"><h1>Grupo Económico</h1></div>
        <div className="error-banner">{errorGrupo}</div>
      </div>
    );
  }

  if (!grupo) {
    // La ruta ya está restringida a ADMINISTRADOR (ProtectedRoute, App.tsx) — este chequeo es
    // una segunda barrera explícita antes de mostrar cualquier control de escritura, igual
    // criterio que el resto de esta pantalla (ver comentario de más arriba, cargarGrupo()).
    if (usuario?.rol !== "ADMINISTRADOR") {
      return (
        <div>
          <div className="page-header"><h1>Grupo Económico</h1></div>
          <p className="muted">Tu organización todavía no pertenece a ningún grupo económico.</p>
        </div>
      );
    }

    return (
      <div>
        <div className="page-header"><h1>Grupo Económico</h1></div>
        <p className="muted">Tu organización todavía no pertenece a ningún grupo económico.</p>

        <div className="card">
          <div className="section-title">Crear Grupo Económico</div>
          <p className="muted">
            Un Grupo Económico agrupa varias organizaciones (una por cada CUIT) para compartir identidad de
            choferes, otorgar acceso cruzado y consolidar pagos. Tu organización actual queda como su primera
            integrante.
          </p>
          <form onSubmit={handleCrearGrupo}>
            {errorNombreGrupo && <div className="error-banner">{errorNombreGrupo}</div>}
            {crearGrupoAccion.error && <div className="error-banner">{crearGrupoAccion.error}</div>}
            {crearGrupoAccion.success && <div className="success-banner">{crearGrupoAccion.success}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Nombre del grupo</label>
                <input
                  value={nombreGrupo}
                  onChange={(e) => {
                    setNombreGrupo(e.target.value);
                    if (errorNombreGrupo) setErrorNombreGrupo("");
                  }}
                  disabled={crearGrupoAccion.busy}
                  required
                />
              </div>
            </div>
            <div className="actions-row">
              <button className="btn" type="submit" disabled={crearGrupoAccion.busy}>
                {crearGrupoAccion.busy ? "Creando..." : "Crear grupo"}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="section-title">Unirse a un Grupo Económico existente</div>
          <p className="muted">
            Pedile el Código del Grupo Económico al administrador de la organización que ya creó el grupo e
            ingresalo acá para incorporar tu organización actual.
          </p>
          <form onSubmit={handleUnirseGrupo}>
            {errorCodigoUnirse && <div className="error-banner">{errorCodigoUnirse}</div>}
            {unirseAccion.error && <div className="error-banner">{unirseAccion.error}</div>}
            {unirseAccion.success && <div className="success-banner">{unirseAccion.success}</div>}
            <div className="form-grid">
              <div className="field">
                <label>Código del Grupo Económico</label>
                <input
                  value={codigoUnirse}
                  onChange={(e) => {
                    setCodigoUnirse(e.target.value);
                    if (errorCodigoUnirse) setErrorCodigoUnirse("");
                  }}
                  disabled={unirseAccion.busy}
                  placeholder="Pegá acá el código que te compartieron"
                  required
                />
              </div>
            </div>
            <div className="actions-row">
              <button className="btn" type="submit" disabled={unirseAccion.busy}>
                {unirseAccion.busy ? "Uniendo..." : "Unir mi organización"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Grupo Económico</h1>
      </div>
      <p className="muted">Grupo: {grupo.nombre}</p>

      {usuario?.rol === "ADMINISTRADOR" && (
        <div className="card">
          <div className="section-title">Código del Grupo Económico</div>
          <p className="muted">
            Es una credencial operativa permanente, no una invitación temporal: cualquiera que la tenga puede
            incorporar una organización a este grupo, y hoy no existe forma de revocarla o hacerla expirar.
            Compartila únicamente con el administrador de la organización que querés incorporar, por un canal
            privado que controlás — nunca la publiques.
          </p>
          {errorCopiado && <div className="error-banner">{errorCopiado}</div>}
          <div className="codigo-grupo">
            <code>{grupo.id}</code>
            <button className="btn secondary" type="button" onClick={copiarCodigo}>
              {copiado ? "Código copiado" : "Copiar código"}
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={handleBuscar}>
        <div className="section-title">Otorgar acceso</div>
        {resolverAccion.error && <div className="error-banner">{resolverAccion.error}</div>}
        {otorgarAccion.error && <div className="error-banner">{otorgarAccion.error}</div>}
        {otorgarAccion.success && <div className="success-banner">{otorgarAccion.success}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (candidato) setCandidato(null);
              }}
              disabled={otorgarAccion.busy}
              required
            />
          </div>
        </div>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={resolverAccion.busy || otorgarAccion.busy}>
            {resolverAccion.busy ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {candidato && (
          <div style={{ marginTop: "1rem" }}>
            <p>
              <strong>{candidato.nombre}</strong> — {candidato.email} ({candidato.nombreOrganizacion})
            </p>
            <div className="actions-row">
              <button className="btn" type="button" disabled={otorgarAccion.busy} onClick={handleOtorgar}>
                {otorgarAccion.busy ? "Otorgando..." : "Otorgar acceso"}
              </button>
            </div>
          </div>
        )}
      </form>

      <div className="card">
        <div className="section-title">Accesos vigentes</div>
        {errorAccesos && <div className="error-banner">{errorAccesos}</div>}
        {filaAccion.error && <div className="error-banner">{filaAccion.error}</div>}
        {filaAccion.success && <div className="success-banner">{filaAccion.success}</div>}
        {cargandoAccesos && <p className="muted">Cargando...</p>}
        {!cargandoAccesos && !errorAccesos && accesos.length === 0 && (
          <p className="muted">No hay accesos otorgados todavía.</p>
        )}
        {!cargandoAccesos && accesos.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Destinatario</th>
                <th>Otorgado por</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accesos.map((a) => (
                <tr key={a.id}>
                  <td>{destinatario(a)}</td>
                  <td>{otorgadoPor(a)}</td>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                  <td>
                    <button className="btn danger" disabled={filaAccion.busy} onClick={() => handleRevocar(a)}>
                      Revocar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
