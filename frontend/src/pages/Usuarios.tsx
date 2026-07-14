import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useConfirm } from "../components/ConfirmDialog";

const ROLES = ["ADMINISTRADOR", "GERENCIA", "FACTURACION", "LIQUIDACIONES", "OPERACIONES", "LECTURA"];
const FORM_VACIO = { nombre: "", email: "", rol: "" };

export default function Usuarios() {
  const { usuario } = useAuth();
  const confirm = useConfirm();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorListado, setErrorListado] = useState("");

  const [modo, setModo] = useState<"" | "crear" | "invitar" | "editar">("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(FORM_VACIO);

  // Enlace/token de un solo uso — se muestra una vez (alta directa o restablecer acceso) y se
  // descarta al cerrar el panel; nunca se persiste en localStorage/sessionStorage/estado global.
  const [tokenInfo, setTokenInfo] = useState<{ titulo: string; valor: string } | null>(null);

  const crearAccion = useAsyncAction();
  const invitarAccion = useAsyncAction();
  const editarAccion = useAsyncAction();
  const filaAccion = useAsyncAction();

  function cargar() {
    setCargando(true);
    setErrorListado("");
    api
      .get("/usuarios")
      .then((res) => setUsuarios(res.data))
      .catch((err) => {
        const msg = err?.response?.data?.message;
        setErrorListado(msg === "Forbidden resource" ? "No tenés permiso para ver esta sección." : msg || "No se pudo cargar el listado de usuarios.");
      })
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    // GET /usuarios no está restringido por rol en el backend (decisión ya cerrada de Bloque
    // 9.1) — la pantalla completa es exclusiva de ADMINISTRADOR, así que ni siquiera se pide el
    // listado para otro rol; evita exponer nombre/email/rol de la organización a quien llegó acá
    // por URL directa, sin depender de que el backend lo rechace.
    if (usuario?.rol === "ADMINISTRADOR") cargar();
  }, [usuario]);

  const administradoresActivos = usuarios.filter((u) => u.rol === "ADMINISTRADOR" && u.activo).length;

  function abrirCrear() {
    setForm(FORM_VACIO);
    setModo("crear");
  }
  function abrirInvitar() {
    setForm(FORM_VACIO);
    setModo("invitar");
  }
  function abrirEditar(u: any) {
    setForm({ nombre: u.nombre, email: u.email, rol: u.rol });
    setEditandoId(u.id);
    setModo("editar");
  }
  function cerrarFormulario() {
    setModo("");
    setEditandoId(null);
    setForm(FORM_VACIO);
  }

  function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    crearAccion.run(async () => {
      const { data } = await api.post("/usuarios", form);
      cargar();
      cerrarFormulario();
      // El token que devuelve POST /usuarios es un PasswordResetToken (mismo mecanismo que
      // recuperación de contraseña, 9.1) — se canjea en /restablecer-contrasena, no en
      // /aceptar-invitacion (esa ruta es exclusiva de las invitaciones de 9.6).
      const enlace = `${window.location.origin}/restablecer-contrasena?token=${data.tokenActivacion}`;
      setTokenInfo({ titulo: "Usuario creado — enlace de activación", valor: enlace });
    }, { errorMessage: "No se pudo crear el usuario" });
  }

  function handleInvitar(e: React.FormEvent) {
    e.preventDefault();
    // No cierra el panel al terminar (a diferencia de crear/editar): el mensaje de éxito vive
    // dentro de este mismo bloque (modo === "invitar") — cerrarlo acá lo ocultaría antes de que
    // se llegue a ver. El formulario queda listo para una nueva invitación; "Cancelar" lo cierra.
    invitarAccion.run(
      async () => {
        await api.post("/usuarios/invitaciones", form);
        setForm(FORM_VACIO);
      },
      {
        successMessage: "Invitación enviada. La entrega automática por email depende de que exista un proveedor configurado.",
        errorMessage: "No se pudo enviar la invitación",
      },
    );
  }

  function handleEditar(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    editarAccion.run(
      async () => {
        await api.patch(`/usuarios/${editandoId}`, form);
        cargar();
        cerrarFormulario();
      },
      { errorMessage: "No se pudo actualizar el usuario" },
    );
  }

  async function confirmarDesactivar(u: any) {
    const ultimoAdmin = u.rol === "ADMINISTRADOR" && u.activo && administradoresActivos === 1;
    const ok = await confirm({
      title: "Desactivar usuario",
      message: ultimoAdmin
        ? `${u.nombre} parece ser el único ADMINISTRADOR activo de la organización. El backend va a rechazar esta operación si es así — ¿confirmás igual?`
        : u.rol === "ADMINISTRADOR"
          ? `¿Desactivar a ${u.nombre}? Es ADMINISTRADOR. No va a poder iniciar sesión hasta que se reactive.`
          : `¿Desactivar a ${u.nombre}? No va a poder iniciar sesión hasta que se reactive.`,
      confirmLabel: "Desactivar",
      severity: "high",
    });
    if (!ok.confirmed) return;
    filaAccion.run(
      async () => {
        await api.patch(`/usuarios/${u.id}/activo`, { activo: false });
        cargar();
      },
      { successMessage: `${u.nombre} desactivado.`, errorMessage: "No se pudo desactivar el usuario" },
    );
  }

  async function confirmarActivar(u: any) {
    const ok = await confirm({
      title: "Activar usuario",
      message: `¿Activar a ${u.nombre}? Va a poder iniciar sesión nuevamente.`,
      confirmLabel: "Activar",
    });
    if (!ok.confirmed) return;
    filaAccion.run(
      async () => {
        await api.patch(`/usuarios/${u.id}/activo`, { activo: true });
        cargar();
      },
      { successMessage: `${u.nombre} activado.`, errorMessage: "No se pudo activar el usuario" },
    );
  }

  async function confirmarRestablecerAcceso(u: any) {
    const ok = await confirm({
      title: "Restablecer acceso",
      message: `¿Generar un nuevo enlace de acceso para ${u.nombre}? Cualquier enlace anterior sin usar deja de funcionar.`,
      confirmLabel: "Restablecer acceso",
    });
    if (!ok.confirmed) return;
    filaAccion.run(
      async () => {
        const { data } = await api.post(`/usuarios/${u.id}/restablecer-acceso`, {});
        const enlace = `${window.location.origin}/restablecer-contrasena?token=${data.tokenActivacion}`;
        setTokenInfo({ titulo: `Acceso restablecido — ${u.nombre}`, valor: enlace });
      },
      { errorMessage: "No se pudo restablecer el acceso" },
    );
  }

  function copiar(valor: string) {
    navigator.clipboard?.writeText(valor);
  }

  if (usuario?.rol !== "ADMINISTRADOR") {
    return (
      <div>
        <div className="page-header"><h1>Administración de Usuarios</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Administración de Usuarios</h1>
        <div className="actions-row">
          <button className="btn" onClick={abrirCrear}>Crear usuario</button>
          <button className="btn secondary" onClick={abrirInvitar}>Invitar usuario</button>
        </div>
      </div>

      {errorListado && <div className="error-banner">{errorListado}</div>}

      {tokenInfo && (
        <div className="card warning-card">
          <div className="section-title">{tokenInfo.titulo}</div>
          <p className="muted">Este enlace no se va a volver a mostrar. Copialo y compartilo de forma segura antes de cerrar este mensaje.</p>
          <div className="form-grid">
            <div className="field">
              <label>Enlace</label>
              <input value={tokenInfo.valor} readOnly onFocus={(e) => e.target.select()} />
            </div>
          </div>
          <div className="actions-row">
            <button className="btn secondary" onClick={() => copiar(tokenInfo.valor)}>Copiar</button>
            <button className="btn secondary" onClick={() => setTokenInfo(null)}>Cerrar</button>
          </div>
        </div>
      )}

      {modo === "crear" && (
        <form className="card" onSubmit={handleCrear}>
          <div className="section-title">Crear usuario (alta directa)</div>
          <p className="muted">Crea la cuenta de inmediato y devuelve un enlace de activación para compartir manualmente — necesario mientras no exista un proveedor de email configurado.</p>
          {crearAccion.error && <div className="error-banner">{crearAccion.error}</div>}
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} required>
                <option value="">Seleccionar...</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="actions-row">
            <button className="btn" type="submit" disabled={crearAccion.busy}>{crearAccion.busy ? "Creando..." : "Crear usuario"}</button>
            <button className="btn secondary" type="button" onClick={cerrarFormulario}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === "invitar" && (
        <form className="card" onSubmit={handleInvitar}>
          <div className="section-title">Invitar usuario</div>
          <p className="muted">La persona invitada define su propia contraseña al aceptar. La entrega automática del enlace por email depende de que exista un proveedor configurado.</p>
          {invitarAccion.error && <div className="error-banner">{invitarAccion.error}</div>}
          {invitarAccion.success && <div className="success-banner">{invitarAccion.success}</div>}
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} required>
                <option value="">Seleccionar...</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="actions-row">
            <button className="btn" type="submit" disabled={invitarAccion.busy}>{invitarAccion.busy ? "Enviando..." : "Invitar usuario"}</button>
            <button className="btn secondary" type="button" onClick={cerrarFormulario}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === "editar" && (
        <form className="card" onSubmit={handleEditar}>
          <div className="section-title">Editar usuario</div>
          {editarAccion.error && <div className="error-banner">{editarAccion.error}</div>}
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Rol</label>
              <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} required>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="actions-row">
            <button className="btn" type="submit" disabled={editarAccion.busy}>{editarAccion.busy ? "Guardando..." : "Guardar cambios"}</button>
            <button className="btn secondary" type="button" onClick={cerrarFormulario}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="section-title">Usuarios</div>
        {filaAccion.error && <div className="error-banner">{filaAccion.error}</div>}
        {filaAccion.success && <div className="success-banner">{filaAccion.success}</div>}
        {cargando && <p className="muted">Cargando...</p>}
        {!cargando && usuarios.length === 0 && !errorListado && <p className="muted">No hay usuarios para mostrar.</p>}
        {!cargando && usuarios.length > 0 && (
          <table>
            <thead>
              <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Activo</th><th></th></tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.email}</td>
                  <td>{u.rol}</td>
                  <td>{u.activo ? "Sí" : "No"}</td>
                  <td>
                    <button className="btn secondary" onClick={() => abrirEditar(u)}>Editar</button>{" "}
                    {u.activo ? (
                      <button className="btn danger" disabled={filaAccion.busy} onClick={() => confirmarDesactivar(u)}>Desactivar</button>
                    ) : (
                      <button className="btn success" disabled={filaAccion.busy} onClick={() => confirmarActivar(u)}>Activar</button>
                    )}{" "}
                    <button className="btn secondary" disabled={filaAccion.busy} onClick={() => confirmarRestablecerAcceso(u)}>Restablecer acceso</button>
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
