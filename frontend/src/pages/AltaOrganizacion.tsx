import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { construirPayloadAltaOrganizacion, validarConfirmacionPassword, AltaOrganizacionForm } from "./alta-organizacion-payload";

const FORM_VACIO: AltaOrganizacionForm = {
  nombre: "",
  razonSocial: "",
  cuit: "",
  domicilio: "",
  telefono: "",
  administradorNombre: "",
  administradorEmail: "",
  password: "",
  confirmarPassword: "",
};

// GAP-GE-1 — alta self-service de una segunda (o enésima) Organización, reutilizando el
// endpoint público POST /organizaciones (backend/src/auth/organizaciones-publicas.controller.ts,
// existente desde antes de este bloque, sin cambios). Cada Organizacion representa un CUIT
// distinto — este formulario NUNCA edita la organización actual ni inicia sesión automáticamente
// (el endpoint no devuelve token; el flujo termina en /login, igual que AceptarInvitacion).
export default function AltaOrganizacion() {
  const [form, setForm] = useState<AltaOrganizacionForm>(FORM_VACIO);
  const [errorConfirmacion, setErrorConfirmacion] = useState("");
  const [exito, setExito] = useState<{ nombreOrganizacion: string } | null>(null);
  const { busy, error, setError, run } = useAsyncAction();

  // GAP-GE-1-UX — incidente real: el formulario es más alto que la pantalla y el botón queda
  // lejos del banner de error (que se renderizaba arriba de todo). Alguien parado junto al botón
  // no veía ninguna confirmación de que el submit había fallado — ver AUDITORIA_GAP_GE_1.md. El
  // resumen de error es ahora una región viva (role="alert" + aria-live="assertive") que además
  // se autoenfoca y se desplaza a la vista apenas aparece, sin depender de que el usuario note un
  // cambio visual fuera de su campo de visión actual.
  const mensajeError = errorConfirmacion || error;
  const resumenErrorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mensajeError && resumenErrorRef.current) {
      resumenErrorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      resumenErrorRef.current.focus();
    }
  }, [mensajeError]);

  function actualizar(campo: keyof AltaOrganizacionForm, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    // El error de confirmación de contraseña solo se resuelve tocando una de las dos
    // contraseñas — cambiar otro campo (nombre, CUIT, etc.) no lo invalida.
    if ((campo === "password" || campo === "confirmarPassword") && errorConfirmacion) {
      setErrorConfirmacion("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errorPassword = validarConfirmacionPassword(form.password, form.confirmarPassword);
    if (errorPassword) {
      // Un error de backend previo (de un intento anterior) queda obsoleto frente a este nuevo
      // problema de cliente — nunca mostrar los dos mensajes a la vez.
      if (error) setError("");
      setErrorConfirmacion(errorPassword);
      return;
    }
    setErrorConfirmacion("");
    const payload = construirPayloadAltaOrganizacion(form);
    const resultado = await run(async () => {
      const { data } = await api.post("/organizaciones", payload);
      return data;
    });
    if (resultado) {
      setExito({ nombreOrganizacion: resultado.organizacion?.nombre || form.nombre });
    }
  }

  if (exito) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Organización registrada</h1>
          <p>
            <strong>{exito.nombreOrganizacion}</strong> se creó correctamente, junto con su primer administrador.
          </p>
          <p className="muted">Ya podés iniciar sesión con el email y la contraseña que acabás de definir.</p>
          <Link to="/login">Ir a Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card wide">
        <h1>Registrar una nueva organización</h1>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Cada organización representa un CUIT distinto. Si tu empresa opera con más de un CUIT, registrá acá el
          segundo — después vas a poder unirlo a un Grupo Económico desde la pantalla de administración.
        </p>
        <form onSubmit={handleSubmit}>
          {mensajeError && (
            <div
              className="login-error"
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              ref={resumenErrorRef}
            >
              {mensajeError}
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label>Nombre de la organización</label>
              <input value={form.nombre} onChange={(e) => actualizar("nombre", e.target.value)} disabled={busy} required />
            </div>
            <div className="field">
              <label>Razón social</label>
              <input value={form.razonSocial} onChange={(e) => actualizar("razonSocial", e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>CUIT</label>
              <input value={form.cuit} onChange={(e) => actualizar("cuit", e.target.value)} disabled={busy} required />
            </div>
            <div className="field">
              <label>Domicilio</label>
              <input value={form.domicilio} onChange={(e) => actualizar("domicilio", e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>Teléfono</label>
              <input value={form.telefono} onChange={(e) => actualizar("telefono", e.target.value)} disabled={busy} />
            </div>
          </div>

          <p className="section-title">Administrador inicial</p>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input
                value={form.administradorNombre}
                onChange={(e) => actualizar("administradorNombre", e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                type="email"
                value={form.administradorEmail}
                onChange={(e) => actualizar("administradorEmail", e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label>Contraseña</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => actualizar("password", e.target.value)}
                disabled={busy}
                minLength={8}
                required
              />
            </div>
            <div className="field">
              <label>Repetir contraseña</label>
              <input
                type="password"
                value={form.confirmarPassword}
                onChange={(e) => actualizar("confirmarPassword", e.target.value)}
                disabled={busy}
                minLength={8}
                required
              />
            </div>
          </div>

          <div className="actions-row">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Registrando..." : "Registrar organización"}
            </button>
          </div>
          <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
        </form>
      </div>
    </div>
  );
}
