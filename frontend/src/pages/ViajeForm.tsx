import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

export default function ViajeForm() {
  const navigate = useNavigate();
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);
  const [cereales, setCereales] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [productores, setProductores] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [choferes, setChoferes] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cartaPorte: "",
    ctg: "",
    cerealId: "",
    clienteId: "",
    productorId: "",
    transportistaId: "",
    choferId: "",
    camionId: "",
    acopladoId: "",
    origenId: "",
    destinoId: "",
    toneladas: "",
    tarifaTonelada: "",
    observaciones: "",
  });

  useEffect(() => {
    Promise.all([
      api.get("/cereales"),
      api.get("/clientes"),
      api.get("/productores"),
      api.get("/transportistas"),
      api.get("/ubicaciones"),
    ]).then(([c, cl, p, t, u]) => {
      setCereales(c.data);
      setClientes(cl.data);
      setProductores(p.data);
      setTransportistas(t.data);
      setUbicaciones(u.data);
    });
  }, []);

  useEffect(() => {
    if (!form.transportistaId) {
      setChoferes([]);
      setVehiculos([]);
      return;
    }
    api.get("/choferes", { params: { transportistaId: form.transportistaId } }).then((res) => setChoferes(res.data));
    api.get("/vehiculos", { params: { transportistaId: form.transportistaId } }).then((res) => setVehiculos(res.data));
  }, [form.transportistaId]);

  function update(field: string, value: string) {
    setDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  }

  const importeEstimado = (Number(form.toneladas) || 0) * (Number(form.tarifaTonelada) || 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload: any = { ...form, productorId: form.productorId || null, acopladoId: form.acopladoId || null };
      const { data } = await api.post("/viajes", payload);
      setDirty(false);
      navigate(`/viajes/${data.id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo crear el viaje");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Nuevo viaje</h1>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => update("fecha", e.target.value)} required />
          </div>
          <div className="field">
            <label>Carta de porte</label>
            <input value={form.cartaPorte} onChange={(e) => update("cartaPorte", e.target.value)} required />
          </div>
          <div className="field">
            <label>CTG</label>
            <input value={form.ctg} onChange={(e) => update("ctg", e.target.value)} required />
          </div>
          <div className="field">
            <label>Cereal</label>
            <select value={form.cerealId} onChange={(e) => update("cerealId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {cereales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cliente</label>
            <select value={form.clienteId} onChange={(e) => update("clienteId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Productor (opcional)</label>
            <select value={form.productorId} onChange={(e) => update("productorId", e.target.value)}>
              <option value="">Sin productor</option>
              {productores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Transportista</label>
            <select value={form.transportistaId} onChange={(e) => update("transportistaId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {transportistas.map((t) => <option key={t.id} value={t.id}>{t.razonSocial}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Chofer</label>
            <select value={form.choferId} onChange={(e) => update("choferId", e.target.value)} required disabled={!form.transportistaId}>
              <option value="">Seleccionar...</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Camión</label>
            <select value={form.camionId} onChange={(e) => update("camionId", e.target.value)} required disabled={!form.transportistaId}>
              <option value="">Seleccionar...</option>
              {vehiculos.filter((v) => v.tipo === "CAMION").map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Acoplado (opcional)</label>
            <select value={form.acopladoId} onChange={(e) => update("acopladoId", e.target.value)} disabled={!form.transportistaId}>
              <option value="">Sin acoplado</option>
              {vehiculos.filter((v) => v.tipo === "ACOPLADO").map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Origen</label>
            <select value={form.origenId} onChange={(e) => update("origenId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.tipo})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Destino</label>
            <select value={form.destinoId} onChange={(e) => update("destinoId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.tipo})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Toneladas</label>
            <input type="number" step="0.01" value={form.toneladas} onChange={(e) => update("toneladas", e.target.value)} required />
          </div>
          <div className="field">
            <label>Tarifa por tonelada</label>
            <input type="number" step="0.01" value={form.tarifaTonelada} onChange={(e) => update("tarifaTonelada", e.target.value)} required />
          </div>
          <div className="field">
            <label>Importe estimado</label>
            <input value={importeEstimado.toLocaleString("es-AR")} disabled />
          </div>
        </div>
        <div className="field" style={{ marginTop: "1rem" }}>
          <label>Observaciones</label>
          <textarea rows={3} value={form.observaciones} onChange={(e) => update("observaciones", e.target.value)} />
        </div>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={saving}>{saving ? "Guardando..." : "Crear viaje"}</button>
        </div>
      </form>
    </div>
  );
}
