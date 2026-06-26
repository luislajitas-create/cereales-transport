import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Transportistas() {
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState({ razonSocial: "", cuit: "", domicilio: "" });
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [nuevoChofer, setNuevoChofer] = useState({ nombre: "", dni: "", cuil: "", licenciaNumero: "" });
  const [nuevoVehiculo, setNuevoVehiculo] = useState({ patente: "", marca: "", modelo: "", tipo: "CAMION", capacidadKg: "" });

  function cargar() {
    api.get("/transportistas").then((res) => setTransportistas(res.data));
  }
  useEffect(() => { cargar(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/transportistas", nuevo);
      setNuevo({ razonSocial: "", cuit: "", domicilio: "" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo crear el transportista");
    }
  }

  async function agregarChofer(transportistaId: string, e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/choferes", { ...nuevoChofer, transportistaId });
      setNuevoChofer({ nombre: "", dni: "", cuil: "", licenciaNumero: "" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo agregar el chofer");
    }
  }

  async function agregarVehiculo(transportistaId: string, e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/vehiculos", { ...nuevoVehiculo, transportistaId, capacidadKg: Number(nuevoVehiculo.capacidadKg) || null });
      setNuevoVehiculo({ patente: "", marca: "", modelo: "", tipo: "CAMION", capacidadKg: "" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo agregar el vehículo");
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Transportistas</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <form className="card" onSubmit={crear}>
        <div className="section-title">Nuevo transportista</div>
        <div className="form-grid">
          <div className="field">
            <label>Razón social</label>
            <input value={nuevo.razonSocial} onChange={(e) => setNuevo({ ...nuevo, razonSocial: e.target.value })} required />
          </div>
          <div className="field">
            <label>CUIT</label>
            <input value={nuevo.cuit} onChange={(e) => setNuevo({ ...nuevo, cuit: e.target.value })} required />
          </div>
          <div className="field">
            <label>Domicilio</label>
            <input value={nuevo.domicilio} onChange={(e) => setNuevo({ ...nuevo, domicilio: e.target.value })} />
          </div>
        </div>
        <div className="actions-row"><button className="btn" type="submit">Agregar</button></div>
      </form>

      {transportistas.map((t) => (
        <div className="card" key={t.id}>
          <div className="page-header" style={{ marginBottom: "0.5rem" }}>
            <strong>{t.razonSocial}</strong> <span className="muted">{t.cuit}</span>
            <button className="btn secondary" onClick={() => setExpandido(expandido === t.id ? null : t.id)}>
              {expandido === t.id ? "Cerrar" : "Ver choferes / vehículos"}
            </button>
          </div>
          {expandido === t.id && (
            <>
              <div className="section-title">Choferes</div>
              <table>
                <thead><tr><th>Nombre</th><th>DNI</th><th>CUIL</th><th>Licencia</th></tr></thead>
                <tbody>
                  {t.choferes.map((c: any) => (
                    <tr key={c.id}><td>{c.nombre}</td><td>{c.dni || "—"}</td><td>{c.cuil}</td><td>{c.licenciaNumero || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <form onSubmit={(e) => agregarChofer(t.id, e)} className="filters" style={{ marginTop: "0.6rem" }}>
                <input placeholder="Nombre" value={nuevoChofer.nombre} onChange={(e) => setNuevoChofer({ ...nuevoChofer, nombre: e.target.value })} required />
                <input placeholder="DNI" value={nuevoChofer.dni} onChange={(e) => setNuevoChofer({ ...nuevoChofer, dni: e.target.value })} />
                <input placeholder="CUIL" value={nuevoChofer.cuil} onChange={(e) => setNuevoChofer({ ...nuevoChofer, cuil: e.target.value })} required />
                <input placeholder="N° Licencia" value={nuevoChofer.licenciaNumero} onChange={(e) => setNuevoChofer({ ...nuevoChofer, licenciaNumero: e.target.value })} />
                <button className="btn" type="submit">+ Chofer</button>
              </form>

              <div className="section-title">Vehículos</div>
              <table>
                <thead><tr><th>Patente</th><th>Marca/Modelo</th><th>Tipo</th><th>Capacidad (kg)</th></tr></thead>
                <tbody>
                  {t.vehiculos.map((v: any) => (
                    <tr key={v.id}><td>{v.patente}</td><td>{v.marca} {v.modelo}</td><td>{v.tipo}</td><td>{v.capacidadKg || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <form onSubmit={(e) => agregarVehiculo(t.id, e)} className="filters" style={{ marginTop: "0.6rem" }}>
                <input placeholder="Patente" value={nuevoVehiculo.patente} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, patente: e.target.value })} required />
                <input placeholder="Marca" value={nuevoVehiculo.marca} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, marca: e.target.value })} />
                <input placeholder="Modelo" value={nuevoVehiculo.modelo} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, modelo: e.target.value })} />
                <select value={nuevoVehiculo.tipo} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, tipo: e.target.value })}>
                  <option value="CAMION">Camión</option>
                  <option value="ACOPLADO">Acoplado</option>
                </select>
                <input placeholder="Capacidad kg" type="number" value={nuevoVehiculo.capacidadKg} onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, capacidadKg: e.target.value })} />
                <button className="btn" type="submit">+ Vehículo</button>
              </form>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
