import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export default function RestablecerContrasena() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const [repetirContrasena, setRepetirContrasena] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nuevaContrasena.length < 8) {
      setError("La contraseña nueva debe tener al menos 8 caracteres.");
      return;
    }
    if (nuevaContrasena !== repetirContrasena) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/restablecer-contrasena", { token, nuevaContrasena });
      setExito(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || "El enlace no es válido o ya expiró.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Restablecer contraseña</h1>
          <div className="login-error">El enlace no es válido o ya expiró.</div>
          <p className="login-hint"><Link to="/recuperar-contrasena">Solicitar un nuevo enlace</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Restablecer contraseña</h1>

        {exito ? (
          <>
            <p>Contraseña actualizada correctamente. Ya podés iniciar sesión.</p>
            <Link to="/login">Ir a Login</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}
            <input
              type="password"
              placeholder="Contraseña nueva"
              value={nuevaContrasena}
              onChange={(e) => setNuevaContrasena(e.target.value)}
              minLength={8}
              required
            />
            <input
              type="password"
              placeholder="Repetir contraseña nueva"
              value={repetirContrasena}
              onChange={(e) => setRepetirContrasena(e.target.value)}
              minLength={8}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Restablecer contraseña"}
            </button>
            <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
