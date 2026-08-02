import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "../components/ConfirmDialog";
import { useAsyncAction } from "../hooks/useAsyncAction";

const TRANSPORTISTA_VACIO = { razonSocial: "", cuit: "", domicilio: "" };

type Orden = "razonSocial" | "createdAt" | "activo";

export default function Transportistas() {
  const { usuario } = useAuth();
  // CRM-2: mismo patrón ya usado en Viajes/Liquidaciones (puedeGestionarX), reflejando
  // exactamente los @Roles() del backend — no una regla nueva. Alta/edición/baja-reactivación/
  // importación CSV de transportistas y alta de vehículos exigen OPERACIONES o ADMINISTRADOR
  // (transportistas.controller.ts/vehiculos.controller.ts); alta/edición de choferes (incluida
  // la comisión) admite además LIQUIDACIONES (choferes.controller.ts). LECTURA no entra en
  // ninguno de los dos conjuntos, por lo que antes de este fix veía y podía intentar ejecutar
  // estas acciones (el backend ya las rechazaba con 403, pero la UI no debía ofrecerlas).
  const puedeGestionarTransportistas = usuario?.rol === "OPERACIONES" || usuario?.rol === "ADMINISTRADOR";
  const puedeGestionarChoferes = usuario?.rol === "OPERACIONES" || usuario?.rol === "LIQUIDACIONES" || usuario?.rol === "ADMINISTRADOR";
  const confirm = useConfirm();
  // CRM-2: mismo patrón ya usado en Clientes/Viajes/Liquidaciones/Facturas para busy/error/
  // success — reemplaza el useState("") de error suelto que tenía esta pantalla. Las funciones
  // de choferes/vehículos en sí (agregarChofer/guardarComision/agregarVehiculo, fuera de alcance
  // funcional de CRM-2) siguen usando setError directamente, igual que antes; lo único agregado
  // es el gating de visibilidad de sus botones/formularios (puedeGestionarChoferes/
  // puedeGestionarTransportistas más arriba).
  const { busy, error, success, setError, run } = useAsyncAction();
  const [transportistas, setTransportistas] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState(TRANSPORTISTA_VACIO);
  // CRM-2: null = alta; con id = edición. Reusa el mismo formulario de "Nuevo transportista".
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("razonSocial");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [nuevoChofer, setNuevoChofer] = useState({ nombre: "", dni: "", cuil: "", licenciaNumero: "", comisionPct: "0" });
  const [nuevoVehiculo, setNuevoVehiculo] = useState({ patente: "", marca: "", modelo: "", tipo: "CAMION", capacidadKg: "" });
  const [comisionEdit, setComisionEdit] = useState<Record<string, string>>({});
  // CAT-1: importación masiva por CSV — camino adicional al alta individual de arriba, no un
  // reemplazo.
  const [archivoImportar, setArchivoImportar] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] = useState<{ total: number; creados: number; rechazados: number; detalle: { fila: number; ok: boolean; mensaje: string }[] } | null>(null);

  // CRM-2: incluirInactivos=true — antes esta pantalla solo pedía activos, lo cual habría
  // dejado los KPIs de "inactivos"/"total" siempre en 0 y sin forma de ver ni reactivar a quien
  // se dio de baja. No afecta a otros consumidores de GET /transportistas (Liquidaciones.tsx/
  // Anticipos.tsx/Rentabilidad.tsx/ViajeForm.tsx piden sus propios candidatos sin este parámetro).
  function cargar() {
    api.get("/transportistas", { params: { incluirInactivos: "true" } }).then((res) => setTransportistas(res.data));
  }
  useEffect(() => { cargar(); }, []);

  async function descargarPlantillaImportacion() {
    const { data } = await api.get("/transportistas/importar/plantilla", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-transportistas.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function importarCsv() {
    if (!archivoImportar) return;
    setImportando(true);
    setError("");
    setResultadoImportacion(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportar);
      const { data } = await api.post("/transportistas/importar", formData);
      setResultadoImportacion(data);
      setArchivoImportar(null);
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo importar el archivo");
    } finally {
      setImportando(false);
    }
  }

  function iniciarEdicion(t: any) {
    setEditandoId(t.id);
    setNuevo({ razonSocial: t.razonSocial, cuit: t.cuit, domicilio: t.domicilio || "" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setNuevo(TRANSPORTISTA_VACIO);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const idEnEdicion = editandoId;
    run(
      async () => {
        if (idEnEdicion) await api.patch(`/transportistas/${idEnEdicion}`, nuevo);
        else await api.post("/transportistas", nuevo);
        setNuevo(TRANSPORTISTA_VACIO);
        setEditandoId(null);
        cargar();
      },
      {
        successMessage: idEnEdicion ? "Transportista actualizado correctamente." : "Transportista creado correctamente.",
        errorMessage: idEnEdicion ? "No se pudo actualizar el transportista" : "No se pudo crear el transportista",
      },
    );
  }

  async function alternarActivo(t: any) {
    if (t.activo) {
      const ok = await confirm({
        title: "Desactivar transportista",
        message: `¿Desactivar a ${t.razonSocial}? Podés reactivarlo en cualquier momento.`,
        confirmLabel: "Desactivar",
      });
      if (!ok.confirmed) return;
    }
    run(
      async () => {
        await api.patch(`/transportistas/${t.id}`, { activo: !t.activo });
        cargar();
      },
      {
        successMessage: t.activo ? `${t.razonSocial} desactivado.` : `${t.razonSocial} reactivado.`,
        errorMessage: "No se pudo actualizar el estado del transportista",
      },
    );
  }

  async function agregarChofer(transportistaId: string, e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/choferes", { ...nuevoChofer, comisionPct: Number(nuevoChofer.comisionPct) || 0, transportistaId });
      setNuevoChofer({ nombre: "", dni: "", cuil: "", licenciaNumero: "", comisionPct: "0" });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo agregar el chofer");
    }
  }

  async function guardarComision(choferId: string) {
    setError("");
    try {
      await api.patch(`/choferes/${choferId}`, { comisionPct: Number(comisionEdit[choferId]) || 0 });
      setComisionEdit((prev) => { const next = { ...prev }; delete next[choferId]; return next; });
      cargar();
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo actualizar la comisión");
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

  // CRM-2: búsqueda instantánea (sin botón) y orden — ambas client-side, catálogo chico ya
  // completo en memoria (sin paginación en este listado, mismo criterio que Clientes/CRM-1).
  const transportistasFiltrados = transportistas
    .filter((t) => {
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      return t.razonSocial.toLowerCase().includes(q) || t.cuit.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (orden === "razonSocial") return a.razonSocial.localeCompare(b.razonSocial);
      if (orden === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return Number(b.activo) - Number(a.activo);
    });

  const totalTransportistas = transportistas.length;
  const activos = transportistas.filter((t) => t.activo).length;
  const inactivos = totalTransportistas - activos;

  return (
    <div>
      <div className="page-header"><h1>Transportistas</h1></div>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Transportistas activos</div>
          <div className="value">{activos}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Transportistas inactivos</div>
          <div className="value">{inactivos}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Total</div>
          <div className="value">{totalTransportistas}</div>
        </div>
      </div>

      {puedeGestionarTransportistas && (
        <form className="card" onSubmit={guardar}>
          <div className="section-title">{editandoId ? "Editar transportista" : "Nuevo transportista"}</div>
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
          <div className="actions-row">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Guardando..." : editandoId ? "Guardar cambios" : "Agregar"}
            </button>
            {editandoId && <button className="btn secondary" type="button" onClick={cancelarEdicion}>Cancelar edición</button>}
          </div>
        </form>
      )}

      {puedeGestionarTransportistas && (
        <div className="card">
          <div className="section-title">Importar desde CSV</div>
          <p className="muted">Cargá varios transportistas a la vez. Descargá la plantilla para saber qué columnas usar.</p>
          <div className="actions-row">
            <button className="btn secondary" type="button" onClick={descargarPlantillaImportacion}>Descargar plantilla</button>
            <input type="file" accept=".csv" onChange={(e) => setArchivoImportar(e.target.files?.[0] || null)} />
            <button className="btn" type="button" disabled={!archivoImportar || importando} onClick={importarCsv}>
              {importando ? "Importando..." : "Importar"}
            </button>
          </div>
          {resultadoImportacion && (
            <div className={resultadoImportacion.rechazados > 0 ? "warning-banner" : "success-banner"}>
              <strong>{resultadoImportacion.creados} de {resultadoImportacion.total} transportistas creados</strong>
              {resultadoImportacion.rechazados > 0 && ` — ${resultadoImportacion.rechazados} rechazados:`}
              {resultadoImportacion.rechazados > 0 && (
                <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
                  {resultadoImportacion.detalle.filter((d) => !d.ok).map((d) => (
                    <li key={d.fila}>Fila {d.fila}: {d.mensaje}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="filters">
        <div className="field">
          <label>Buscar</label>
          <input
            type="text"
            placeholder="Por razón social o CUIT"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Ordenar por</label>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="razonSocial">Razón social</option>
            <option value="createdAt">Fecha de creación</option>
            <option value="activo">Estado</option>
          </select>
        </div>
      </div>

      {transportistasFiltrados.length === 0 && (
        <p className="muted">No hay transportistas que coincidan con la búsqueda.</p>
      )}

      {transportistasFiltrados.map((t) => (
        <div className="card" key={t.id}>
          <div className="page-header" style={{ marginBottom: "0.5rem" }}>
            <strong>{t.razonSocial}</strong> <span className="muted">{t.cuit}</span>{" "}
            <span className={`badge ${t.activo ? "ACTIVO" : "INACTIVO"}`}>{t.activo ? "Activo" : "Inactivo"}</span>
            <div className="actions-row" style={{ marginTop: 0 }}>
              {puedeGestionarTransportistas && <button className="btn secondary" onClick={() => iniciarEdicion(t)}>Editar</button>}
              {puedeGestionarTransportistas && (
                <button className="btn secondary" onClick={() => alternarActivo(t)} disabled={busy}>
                  {t.activo ? "Desactivar" : "Reactivar"}
                </button>
              )}
              <button className="btn secondary" onClick={() => setExpandido(expandido === t.id ? null : t.id)}>
                {expandido === t.id ? "Cerrar" : "Ver choferes / vehículos"}
              </button>
            </div>
          </div>
          {expandido === t.id && (
            <>
              <div className="section-title">Choferes</div>
              <table>
                <thead><tr><th>Nombre</th><th>DNI</th><th>CUIL</th><th>Licencia</th><th>Comisión %</th><th></th></tr></thead>
                <tbody>
                  {t.choferes.map((c: any) => {
                    const editando = comisionEdit[c.id] !== undefined;
                    return (
                      <tr key={c.id}>
                        <td>{c.nombre}</td>
                        <td>{c.dni || "—"}</td>
                        <td>{c.cuil}</td>
                        <td>{c.licenciaNumero || "—"}</td>
                        <td>
                          {editando ? (
                            <input
                              type="number"
                              step="0.01"
                              style={{ width: "5rem" }}
                              value={comisionEdit[c.id]}
                              onChange={(e) => setComisionEdit({ ...comisionEdit, [c.id]: e.target.value })}
                            />
                          ) : (
                            c.comisionPct
                          )}
                        </td>
                        <td>
                          {!puedeGestionarChoferes ? null : editando ? (
                            <>
                              <button className="btn secondary" onClick={() => guardarComision(c.id)}>Guardar</button>{" "}
                              <button
                                className="btn secondary"
                                onClick={() => setComisionEdit((prev) => { const next = { ...prev }; delete next[c.id]; return next; })}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn secondary"
                              onClick={() => setComisionEdit({ ...comisionEdit, [c.id]: String(c.comisionPct) })}
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {puedeGestionarChoferes && (
                <form onSubmit={(e) => agregarChofer(t.id, e)} className="filters" style={{ marginTop: "0.6rem" }}>
                  <input placeholder="Nombre" value={nuevoChofer.nombre} onChange={(e) => setNuevoChofer({ ...nuevoChofer, nombre: e.target.value })} required />
                  <input placeholder="DNI" value={nuevoChofer.dni} onChange={(e) => setNuevoChofer({ ...nuevoChofer, dni: e.target.value })} />
                  <input placeholder="CUIL" value={nuevoChofer.cuil} onChange={(e) => setNuevoChofer({ ...nuevoChofer, cuil: e.target.value })} required />
                  <input placeholder="N° Licencia" value={nuevoChofer.licenciaNumero} onChange={(e) => setNuevoChofer({ ...nuevoChofer, licenciaNumero: e.target.value })} />
                  <input placeholder="Comisión %" type="number" step="0.01" style={{ width: "6rem" }} value={nuevoChofer.comisionPct} onChange={(e) => setNuevoChofer({ ...nuevoChofer, comisionPct: e.target.value })} />
                  <button className="btn" type="submit">+ Chofer</button>
                </form>
              )}

              <div className="section-title">Vehículos</div>
              <table>
                <thead><tr><th>Patente</th><th>Marca/Modelo</th><th>Tipo</th><th>Capacidad (kg)</th></tr></thead>
                <tbody>
                  {t.vehiculos.map((v: any) => (
                    <tr key={v.id}><td>{v.patente}</td><td>{v.marca} {v.modelo}</td><td>{v.tipo}</td><td>{v.capacidadKg || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              {puedeGestionarTransportistas && (
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
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
