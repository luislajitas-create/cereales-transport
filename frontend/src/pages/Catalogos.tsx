import { useEffect, useState } from "react";
import { api } from "../api/client";

const TABS = [
  { key: "cereales", label: "Cereales", endpoint: "/cereales", fields: [{ name: "nombre", label: "Nombre" }] },
  {
    key: "ubicaciones",
    label: "Ubicaciones",
    endpoint: "/ubicaciones",
    fields: [
      { name: "nombre", label: "Nombre" },
      { name: "tipo", label: "Tipo", type: "select", options: ["ACOPIO", "PLANTA", "PUERTO", "CAMPO", "OTRO"] },
      { name: "localidad", label: "Localidad" },
    ],
  },
  {
    key: "tipos-gasto",
    label: "Tipos de gasto",
    endpoint: "/tipos-gasto",
    fields: [{ name: "nombre", label: "Nombre" }],
  },
  {
    key: "productores",
    label: "Productores",
    endpoint: "/productores",
    fields: [
      { name: "nombre", label: "Nombre" },
      { name: "cuit", label: "CUIT" },
      { name: "localidad", label: "Localidad" },
    ],
  },
];

export default function Catalogos() {
  const [tab, setTab] = useState(TABS[0]);
  const [items, setItems] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState<any>({});
  const [error, setError] = useState("");

  function cargar() {
    api.get(tab.endpoint).then((res) => setItems(res.data));
  }
  useEffect(() => { setNuevo({}); cargar(); }, [tab]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post(tab.endpoint, nuevo);
      setNuevo({});
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo crear el registro");
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Catálogos</h1></div>
      {error && <div className="error-banner">{error}</div>}

      <div className="filters">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={t.key === tab.key ? "btn" : "btn secondary"}
            onClick={() => setTab(t)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form className="card" onSubmit={crear}>
        <div className="section-title">Nuevo: {tab.label}</div>
        <div className="form-grid">
          {tab.fields.map((f: any) => (
            <div className="field" key={f.name}>
              <label>{f.label}</label>
              {f.type === "select" ? (
                <select value={nuevo[f.name] || ""} onChange={(e) => setNuevo({ ...nuevo, [f.name]: e.target.value })} required>
                  <option value="">Seleccionar...</option>
                  {f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input value={nuevo[f.name] || ""} onChange={(e) => setNuevo({ ...nuevo, [f.name]: e.target.value })} required={f.name === "nombre"} />
              )}
            </div>
          ))}
        </div>
        <div className="actions-row"><button className="btn" type="submit">Agregar</button></div>
      </form>

      <table>
        <thead>
          <tr>{tab.fields.map((f: any) => <th key={f.name}>{f.label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {tab.fields.map((f: any) => <td key={f.name}>{item[f.name] || "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
