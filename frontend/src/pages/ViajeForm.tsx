import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import { useAsyncAction } from "../hooks/useAsyncAction";

export default function ViajeForm() {
  const navigate = useNavigate();
  const location = useLocation();
  // Núcleo Viajes 2.0, Tarea 3: mismo formulario para crear y editar — evita una segunda
  // implementación. Con :id (ruta /viajes/:id/editar) precarga el Viaje existente y guarda con
  // PATCH; sin :id (ruta /viajes/nuevo) se comporta exactamente igual que antes.
  const { id } = useParams();
  const editando = Boolean(id);
  // Listado Operativo, Bloque L3 (ajuste): ViajeDetalle.tsx pasa su propio "volverA" (la URL del
  // listado filtrado) como state al entrar acá vía "Editar viaje". Simplemente se retransmite tal
  // cual al volver — este componente no necesita conocer su forma, solo reenviarlo.
  const volverA = location.state?.volverA;
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);
  const [cereales, setCereales] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [productores, setProductores] = useState<any[]>([]);
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [choferes, setChoferes] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [ubicaciones, setUbicaciones] = useState<any[]>([]);
  // Hardening (First Trip): antes era useState("")/useState(false) manejado a mano, sin el
  // guard de doble-submit por ref que useAsyncAction ya implementa (ver comentario del propio
  // hook) — dos clics disparados en el mismo tick, antes del primer re-render, podían pasar
  // ambos y crear dos Viajes idénticos. Mismo patrón que ya usan Usuarios.tsx y el resto del
  // proyecto para acciones que mutan datos.
  const accion = useAsyncAction();

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

  useEffect(() => {
    if (!id) return;
    api
      .get(`/viajes/${id}`)
      .then(({ data }) => {
        setForm({
          fecha: data.fecha.slice(0, 10),
          cartaPorte: data.cartaPorte,
          ctg: data.ctg,
          cerealId: data.cerealId,
          clienteId: data.clienteId,
          productorId: data.productorId || "",
          transportistaId: data.transportistaId,
          choferId: data.choferId,
          camionId: data.camionId,
          acopladoId: data.acopladoId || "",
          origenId: data.origenId,
          destinoId: data.destinoId,
          toneladas: String(data.toneladas),
          tarifaTonelada: String(data.tarifaTonelada),
          observaciones: data.observaciones || "",
        });
      })
      .catch(() => accion.setError("No se pudo cargar el viaje a editar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function update(field: string, value: string) {
    setDirty(true);
    setForm((f) => ({ ...f, [field]: value }));
  }

  const importeEstimado = (Number(form.toneladas) || 0) * (Number(form.tarifaTonelada) || 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    accion.run(
      async () => {
        const payload: any = { ...form, productorId: form.productorId || null, acopladoId: form.acopladoId || null };
        if (editando) {
          const { data } = await api.patch(`/viajes/${id}`, payload);
          setDirty(false);
          navigate(`/viajes/${id}`, { state: { volverA } });
          return data;
        }
        const { data } = await api.post("/viajes", payload);
        setDirty(false);
        // UX Refinement (First Trip): estado de navegación, no persistido — ViajeDetalle.tsx lo
        // lee una sola vez al montar para mostrar el mensaje de éxito. No es un cambio de
        // backend ni de la respuesta de la API, es puramente de react-router.
        navigate(`/viajes/${data.id}`, { state: { creado: true } });
        return data;
      },
      { errorMessage: editando ? "No se pudo actualizar el viaje" : "No se pudo crear el viaje" },
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>{editando ? "Editar viaje" : "Nuevo viaje"}</h1>
      </div>
      {accion.error && <div className="error-banner">{accion.error}</div>}
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
            {!form.transportistaId && <p className="muted">Seleccioná primero un Transportista.</p>}
          </div>
          <div className="field">
            <label>Camión</label>
            <select value={form.camionId} onChange={(e) => update("camionId", e.target.value)} required disabled={!form.transportistaId}>
              <option value="">Seleccionar...</option>
              {vehiculos.filter((v) => v.tipo === "CAMION").map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
            </select>
            {!form.transportistaId && <p className="muted">Seleccioná primero un Transportista.</p>}
          </div>
          <div className="field">
            <label>Acoplado (opcional)</label>
            <select value={form.acopladoId} onChange={(e) => update("acopladoId", e.target.value)} disabled={!form.transportistaId}>
              <option value="">Sin acoplado</option>
              {vehiculos.filter((v) => v.tipo === "ACOPLADO").map((v) => <option key={v.id} value={v.id}>{v.patente}</option>)}
            </select>
            {!form.transportistaId && <p className="muted">Seleccioná primero un Transportista.</p>}
          </div>
          <div className="field">
            <label>Origen</label>
            {/* UX Refinement (First Trip): solo ayuda visual — excluye la Ubicación ya elegida
                como Destino de las opciones de Origen. No es una validación nueva (el backend
                sigue sin impedir origenId === destinoId, a propósito, sin tocarlo). */}
            <select value={form.origenId} onChange={(e) => update("origenId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {ubicaciones.filter((u) => u.id !== form.destinoId).map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.tipo})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Destino</label>
            <select value={form.destinoId} onChange={(e) => update("destinoId", e.target.value)} required>
              <option value="">Seleccionar...</option>
              {ubicaciones.filter((u) => u.id !== form.origenId).map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.tipo})</option>)}
            </select>
          </div>
          <div className="field">
            <label>Toneladas</label>
            <input type="number" step="0.01" min="0" value={form.toneladas} onChange={(e) => update("toneladas", e.target.value)} required />
          </div>
          <div className="field">
            <label>Tarifa por tonelada</label>
            <input type="number" step="0.01" min="0" value={form.tarifaTonelada} onChange={(e) => update("tarifaTonelada", e.target.value)} required />
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
          <button className="btn" type="submit" disabled={accion.busy}>
            {accion.busy ? "Guardando..." : editando ? "Guardar cambios" : "Crear viaje"}
          </button>
        </div>
      </form>
    </div>
  );
}
