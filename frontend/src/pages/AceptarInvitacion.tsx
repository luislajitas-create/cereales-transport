import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

const ENLACE_INVALIDO = "El enlace no es válido o ya expiró.";

export default function AceptarInvitacion() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [invitacion, setInvitacion] = useState<{ organizacion: string | null; email: string } | null>(null);
  const [errorCarga, setErrorCarga] = useState("");

  const [contrasena, setContrasena] = useState("");
  const [repetirContrasena, setRepetirContrasena] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    // El backend recibe el token como parámetro de path (no query string) — única traducción
    // de formato entre el enlace generado y los endpoints reales de invitaciones.
    api
      .get(`/usuarios/invitaciones/${encodeURIComponent(token)}`)
      .then((res) => setInvitacion(res.data))
      .catch((err) => setErrorCarga(err?.response?.data?.message || ENLACE_INVALIDO))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!token || enviando) return;
    if (contrasena.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (contrasena !== repetirContrasena) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    try {
      await api.post(`/usuarios/invitaciones/${encodeURIComponent(token)}/aceptar`, { contrasena });
      setExito(true);
      setContrasena("");
      setRepetirContrasena("");
    } catch (err: any) {
      setError(err?.response?.data?.message || ENLACE_INVALIDO);
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Aceptar invitación</h1>
          <div className="login-error">{ENLACE_INVALIDO}</div>
          <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Aceptar invitación</h1>
          <p className="muted">Cargando...</p>
        </div>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Aceptar invitación</h1>
          <div className="login-error">{errorCarga}</div>
          <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
        </div>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Aceptar invitación</h1>
          <p>Cuenta activada correctamente. Ya podés iniciar sesión.</p>
          <Link to="/login">Ir a Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Aceptar invitación</h1>
        <p>
          Organización: <strong>{invitacion?.organizacion ?? "—"}</strong>
          <br />
          Email: <strong>{invitacion?.email}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <input
            type="password"
            placeholder="Contraseña"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Repetir contraseña"
            value={repetirContrasena}
            onChange={(e) => setRepetirContrasena(e.target.value)}
            minLength={8}
            required
          />
          <button type="submit" disabled={enviando}>
            {enviando ? "Activando..." : "Activar cuenta"}
          </button>
          <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
        </form>
      </div>
    </div>
  );
}
