import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarContrasena() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!EMAIL_REGEX.test(email)) {
      setError("Ingresá un email válido.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/recuperar-contrasena", { email });
      setMensaje(data.message);
    } catch (err: any) {
      // Igual que el backend: nunca se distingue si la cuenta existe. Un error de red o de
      // formato se muestra genérico, sin revelar nada distinto del mensaje del propio servidor.
      setMensaje(err?.response?.data?.message || "Si el email corresponde a una cuenta, vas a recibir un enlace para recuperar el acceso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Recuperar contraseña</h1>

        {mensaje ? (
          <>
            <p>{mensaje}</p>
            <Link to="/login">Volver a Login</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar enlace de recuperación"}
            </button>
            <p className="login-hint"><Link to="/login">Volver a Login</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
