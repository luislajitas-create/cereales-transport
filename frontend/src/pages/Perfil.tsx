import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAsyncAction } from "../hooks/useAsyncAction";

export default function Perfil() {
  const [perfil, setPerfil] = useState<any>(null);
  const [nombre, setNombre] = useState("");
  const [contrasenaActual, setContrasenaActual] = useState("");
  const [contrasenaNueva, setContrasenaNueva] = useState("");

  const datos = useAsyncAction();
  const clave = useAsyncAction();

  function cargar() {
    return api.get("/perfil").then((res) => {
      setPerfil(res.data);
      setNombre(res.data.nombre);
    });
  }

  useEffect(() => {
    cargar();
  }, []);

  function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    datos.run(
      async () => {
        const { data } = await api.patch("/perfil", { nombre });
        setPerfil(data);
      },
      { successMessage: "Nombre actualizado.", errorMessage: "No se pudo actualizar el nombre" },
    );
  }

  function cambiarContrasena(e: React.FormEvent) {
    e.preventDefault();
    clave.run(
      async () => {
        await api.patch("/perfil/contrasena", { contrasenaActual, contrasenaNueva });
        setContrasenaActual("");
        setContrasenaNueva("");
      },
      { successMessage: "Contraseña actualizada.", errorMessage: "No se pudo cambiar la contraseña" },
    );
  }

  if (!perfil) return <div className="muted">Cargando...</div>;

  return (
    <div>
      <div className="page-header"><h1>Mi Perfil</h1></div>

      <div className="card">
        <div className="section-title">Datos</div>
        <table>
          <tbody>
            <tr><td>Email</td><td>{perfil.email}</td></tr>
            <tr><td>Rol</td><td>{perfil.rol}</td></tr>
            <tr><td>Estado</td><td>{perfil.activo ? "Activo" : "Inactivo"}</td></tr>
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={guardarNombre}>
        <div className="section-title">Editar nombre</div>
        {datos.error && <div className="error-banner">{datos.error}</div>}
        {datos.success && <div className="success-banner">{datos.success}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>
        </div>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={datos.busy}>{datos.busy ? "Guardando..." : "Guardar nombre"}</button>
        </div>
      </form>

      <form className="card" onSubmit={cambiarContrasena}>
        <div className="section-title">Cambiar contraseña</div>
        {clave.error && <div className="error-banner">{clave.error}</div>}
        {clave.success && <div className="success-banner">{clave.success}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Contraseña actual</label>
            <input type="password" value={contrasenaActual} onChange={(e) => setContrasenaActual(e.target.value)} required />
          </div>
          <div className="field">
            <label>Contraseña nueva</label>
            <input type="password" value={contrasenaNueva} onChange={(e) => setContrasenaNueva(e.target.value)} minLength={8} required />
          </div>
        </div>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={clave.busy}>{clave.busy ? "Guardando..." : "Cambiar contraseña"}</button>
        </div>
      </form>
    </div>
  );
}
