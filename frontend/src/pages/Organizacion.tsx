import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { construirPayloadOrganizacion } from "./organizacion-payload";

const CAMPOS = [
  { name: "nombre", label: "Nombre" },
  { name: "razonSocial", label: "Razón social" },
  { name: "cuit", label: "CUIT" },
  { name: "domicilio", label: "Domicilio" },
  { name: "telefono", label: "Teléfono" },
  { name: "email", label: "Email" },
  { name: "zonaHoraria", label: "Zona horaria" },
  { name: "moneda", label: "Moneda" },
];

export default function Organizacion() {
  const { usuario } = useAuth();
  const puedeEditar = usuario?.rol === "ADMINISTRADOR";
  const [organizacion, setOrganizacion] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const { busy, error, success, run } = useAsyncAction();

  function cargar() {
    return api.get("/organizacion").then((res) => {
      setOrganizacion(res.data);
      setForm(res.data);
    });
  }

  useEffect(() => {
    cargar();
  }, []);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    run(
      async () => {
        // CAT-6: cada campo se compara contra el valor YA CARGADO — un campo sin cambios queda
        // completamente afuera del PATCH. Evita revalidar (y potencialmente rechazar) un campo
        // que la persona usuaria ni tocó: un CUIT histórico con dígito verificador inválido, o un
        // email opcional vacío que nunca se cargó (bug real encontrado por esta misma
        // validación: antes se enviaba `email: ""` en cada guardado, y `@IsEmail()` lo rechazaba
        // aunque nadie hubiera tocado el campo — ver organizacion-payload.ts).
        const payload = construirPayloadOrganizacion(
          CAMPOS.map((c) => c.name),
          organizacion,
          form,
        );
        const { data } = await api.patch("/organizacion", payload);
        setOrganizacion(data);
        setForm(data);
      },
      { successMessage: "Organización actualizada.", errorMessage: "No se pudo actualizar la organización" },
    );
  }

  if (!organizacion) return <div className="muted">Cargando...</div>;

  return (
    <div>
      <div className="page-header"><h1>Mi Organización</h1></div>

      {!puedeEditar && (
        <div className="card">
          <div className="section-title">Datos institucionales</div>
          <table>
            <tbody>
              {CAMPOS.map((c) => (
                <tr key={c.name}><td>{c.label}</td><td>{organizacion[c.name] || "—"}</td></tr>
              ))}
              <tr><td>Creada</td><td>{new Date(organizacion.createdAt).toLocaleDateString()}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {puedeEditar && (
        <form className="card" onSubmit={guardar}>
          <div className="section-title">Datos institucionales</div>
          {error && <div className="error-banner">{error}</div>}
          {success && <div className="success-banner">{success}</div>}
          <div className="form-grid">
            {CAMPOS.map((c) => (
              <div className="field" key={c.name}>
                <label>{c.label}</label>
                <input
                  value={form[c.name] || ""}
                  onChange={(e) => setForm({ ...form, [c.name]: e.target.value })}
                  required={c.name === "nombre"}
                />
              </div>
            ))}
          </div>
          <p className="muted">Creada: {new Date(organizacion.createdAt).toLocaleDateString()}</p>
          <div className="actions-row">
            <button className="btn" type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cambios"}</button>
          </div>
        </form>
      )}
    </div>
  );
}
