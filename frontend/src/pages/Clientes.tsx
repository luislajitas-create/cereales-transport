import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useConfirm } from "../components/ConfirmDialog";
import { useAsyncAction } from "../hooks/useAsyncAction";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

const CLIENTE_VACIO = { razonSocial: "", cuit: "", condicionesComerciales: "" };

type Orden = "razonSocial" | "createdAt" | "activo";

export default function Clientes() {
  const confirm = useConfirm();
  // CRM-1: mismo patrón ya usado en Viajes/Liquidaciones/Facturas para busy/error/success —
  // reemplaza el useState("") de error suelto que tenía esta pantalla, sumando el banner de
  // éxito que pedía CRM-1 sin inventar un mecanismo nuevo.
  const { busy, error, success, run } = useAsyncAction();
  const [clientes, setClientes] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState(CLIENTE_VACIO);
  // CRM-1: null = alta; con id = edición. Reusa el mismo formulario de "Nuevo cliente".
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("razonSocial");
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cuentaCorriente, setCuentaCorriente] = useState<any>(null);
  // CAT-1: importación masiva por CSV — camino adicional al alta individual, no un reemplazo.
  const [archivoImportar, setArchivoImportar] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacion, setResultadoImportacion] = useState<{ total: number; creados: number; rechazados: number; detalle: { fila: number; ok: boolean; mensaje: string }[] } | null>(null);

  // CRM-1: incluirInactivos=true — antes esta pantalla solo pedía activos, lo cual habría
  // dejado los KPIs de "inactivos"/"total" siempre en 0 y sin forma de ver ni reactivar a
  // quien se dio de baja. No afecta a ningún otro consumidor de GET /clientes (Facturas.tsx/
  // Liquidaciones.tsx piden sus propios candidatos por otros endpoints, no este listado).
  function cargar() {
    api.get("/clientes", { params: { incluirInactivos: "true" } }).then((res) => setClientes(res.data));
  }
  useEffect(() => { cargar(); }, []);

  async function descargarPlantillaImportacion() {
    const { data } = await api.get("/clientes/importar/plantilla", { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-clientes.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  async function importarCsv() {
    if (!archivoImportar) return;
    setImportando(true);
    setResultadoImportacion(null);
    try {
      const formData = new FormData();
      formData.append("archivo", archivoImportar);
      const { data } = await api.post("/clientes/importar", formData);
      setResultadoImportacion(data);
      setArchivoImportar(null);
      cargar();
    } catch {
      // El resumen de importación tiene su propio bloque de estado — no comparte el banner
      // global de error/éxito para no pisar un mensaje con el otro si ambos ocurren a la vez.
      setResultadoImportacion(null);
    } finally {
      setImportando(false);
    }
  }

  function iniciarEdicion(c: any) {
    setEditandoId(c.id);
    setNuevo({ razonSocial: c.razonSocial, cuit: c.cuit, condicionesComerciales: c.condicionesComerciales || "" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setNuevo(CLIENTE_VACIO);
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const idEnEdicion = editandoId;
    run(
      async () => {
        if (idEnEdicion) await api.patch(`/clientes/${idEnEdicion}`, nuevo);
        else await api.post("/clientes", nuevo);
        setNuevo(CLIENTE_VACIO);
        setEditandoId(null);
        cargar();
      },
      {
        successMessage: idEnEdicion ? "Cliente actualizado correctamente." : "Cliente creado correctamente.",
        errorMessage: idEnEdicion ? "No se pudo actualizar el cliente" : "No se pudo crear el cliente",
      },
    );
  }

  async function alternarActivo(c: any) {
    if (c.activo) {
      const ok = await confirm({
        title: "Desactivar cliente",
        message: `¿Desactivar a ${c.razonSocial}? Podés reactivarlo en cualquier momento.`,
        confirmLabel: "Desactivar",
      });
      if (!ok.confirmed) return;
    }
    run(
      async () => {
        await api.patch(`/clientes/${c.id}`, { activo: !c.activo });
        cargar();
      },
      {
        successMessage: c.activo ? `${c.razonSocial} desactivado.` : `${c.razonSocial} reactivado.`,
        errorMessage: "No se pudo actualizar el estado del cliente",
      },
    );
  }

  async function verCuentaCorriente(id: string) {
    setSeleccionado(id);
    const { data } = await api.get(`/clientes/${id}/cuenta-corriente`);
    setCuentaCorriente(data);
  }

  // CRM-1: búsqueda instantánea (sin botón) y orden — ambas client-side, catálogo chico ya
  // completo en memoria (sin paginación en este listado, a diferencia de Viajes/Facturas/
  // Liquidaciones). "Mantener búsqueda"/"mantener orden"/"mantener selección" se cumplen solos:
  // ninguna acción de esta pantalla resetea busqueda/orden/seleccionado.
  const clientesFiltrados = clientes
    .filter((c) => {
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      return c.razonSocial.toLowerCase().includes(q) || c.cuit.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (orden === "razonSocial") return a.razonSocial.localeCompare(b.razonSocial);
      if (orden === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return Number(b.activo) - Number(a.activo);
    });

  const totalClientes = clientes.length;
  const activos = clientes.filter((c) => c.activo).length;
  const inactivos = totalClientes - activos;

  return (
    <div>
      <div className="page-header"><h1>Clientes</h1></div>
      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Clientes activos</div>
          <div className="value">{activos}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Clientes inactivos</div>
          <div className="value">{inactivos}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Total</div>
          <div className="value">{totalClientes}</div>
        </div>
      </div>

      <form className="card" onSubmit={guardar}>
        <div className="section-title">{editandoId ? "Editar cliente" : "Nuevo cliente"}</div>
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
            <label>Condiciones comerciales</label>
            <input value={nuevo.condicionesComerciales} onChange={(e) => setNuevo({ ...nuevo, condicionesComerciales: e.target.value })} />
          </div>
        </div>
        <div className="actions-row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Guardando..." : editandoId ? "Guardar cambios" : "Agregar"}
          </button>
          {editandoId && <button className="btn secondary" type="button" onClick={cancelarEdicion}>Cancelar edición</button>}
        </div>
      </form>

      <div className="card">
        <div className="section-title">Importar desde CSV</div>
        <p className="muted">Cargá varios clientes a la vez. Descargá la plantilla para saber qué columnas usar.</p>
        <div className="actions-row">
          <button className="btn secondary" type="button" onClick={descargarPlantillaImportacion}>Descargar plantilla</button>
          <input type="file" accept=".csv" onChange={(e) => setArchivoImportar(e.target.files?.[0] || null)} />
          <button className="btn" type="button" disabled={!archivoImportar || importando} onClick={importarCsv}>
            {importando ? "Importando..." : "Importar"}
          </button>
        </div>
        {resultadoImportacion && (
          <div className={resultadoImportacion.rechazados > 0 ? "warning-banner" : "success-banner"}>
            <strong>{resultadoImportacion.creados} de {resultadoImportacion.total} clientes creados</strong>
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

      <table>
        <thead><tr><th>Razón social</th><th>CUIT</th><th>Condiciones</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          {clientesFiltrados.map((c) => (
            <tr key={c.id}>
              <td>{c.razonSocial}</td>
              <td>{c.cuit}</td>
              <td>{c.condicionesComerciales || "—"}</td>
              <td><span className={`badge ${c.activo ? "ACTIVO" : "INACTIVO"}`}>{c.activo ? "Activo" : "Inactivo"}</span></td>
              <td>{new Date(c.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="btn secondary" onClick={() => iniciarEdicion(c)}>Editar</button>{" "}
                <button className="btn secondary" onClick={() => alternarActivo(c)} disabled={busy}>
                  {c.activo ? "Desactivar" : "Reactivar"}
                </button>{" "}
                <button className="btn secondary" onClick={() => verCuentaCorriente(c.id)}>Cuenta corriente</button>
              </td>
            </tr>
          ))}
          {clientesFiltrados.length === 0 && (
            <tr><td colSpan={6} className="muted">No hay clientes que coincidan con la búsqueda.</td></tr>
          )}
        </tbody>
      </table>

      {seleccionado && cuentaCorriente && (
        <div className="card">
          <div className="section-title">Cuenta corriente</div>
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead>
            <tbody>
              {cuentaCorriente.movimientos.map((m: any, i: number) => (
                <tr key={i}>
                  <td>{new Date(m.fecha).toLocaleDateString()}</td>
                  <td>{m.concepto}</td>
                  <td>{m.debe ? fmtMoney(m.debe) : "—"}</td>
                  <td>{m.haber ? fmtMoney(m.haber) : "—"}</td>
                  <td>{fmtMoney(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="totals-table"><td colSpan={4}>Saldo actual</td><td>{fmtMoney(cuentaCorriente.saldoActual)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
