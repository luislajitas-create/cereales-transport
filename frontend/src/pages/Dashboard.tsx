import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// Asistente de Puesta en Marcha — etiqueta y ruta por código de requisito. Único lugar que
// necesita tocarse si mañana el backend agrega un requisito nuevo (Productores, Certificados,
// etc.): agregar una fila acá, el resto del componente ya itera "requisitos" de forma genérica,
// sin ningún JSX específico por catálogo.
//
// choferes/vehiculosCamion apuntan a /transportistas (no /clientes) porque su alta vive
// anidada dentro del panel expandido de cada Transportista — no existe una ruta propia
// (Transportistas.tsx, confirmado antes de diseñar esto). ubicaciones usa ?tab=ubicaciones,
// que Catalogos.tsx ahora sabe leer para preseleccionar la pestaña correcta.
const ETIQUETA_REQUISITO: Record<string, string> = {
  clientes: "Clientes",
  transportistas: "Transportistas",
  choferes: "Choferes",
  vehiculosCamion: "Vehículos (tipo camión)",
  cereales: "Cereales",
  ubicaciones: "Ubicaciones",
};

const RUTA_REQUISITO: Record<string, string> = {
  clientes: "/clientes",
  transportistas: "/transportistas",
  choferes: "/transportistas",
  vehiculosCamion: "/transportistas",
  cereales: "/catalogos",
  ubicaciones: "/catalogos?tab=ubicaciones",
};

function AsistentePuestaEnMarcha({ estado }: { estado: any }) {
  const claves = Object.keys(estado.requisitos);
  const cumplidos = claves.filter((clave) => estado.requisitos[clave].cumplido).length;

  return (
    <div className="card warning-card">
      <div className="section-title">Completá la puesta en marcha de tu organización</div>
      <p className="muted">{cumplidos} de {claves.length} requisitos completados</p>
      <div className="progreso-barra">
        <div className="progreso-relleno" style={{ width: `${estado.porcentaje}%` }} />
      </div>
      <ul className="requisitos-lista">
        {claves.map((clave) => {
          const requisito = estado.requisitos[clave];
          return (
            <li key={clave} className={requisito.cumplido ? "cumplido" : "pendiente"}>
              <span className="requisito-nombre">
                <span className="requisito-check">{requisito.cumplido ? "✓" : "○"}</span>
                {ETIQUETA_REQUISITO[clave] || clave}
              </span>
              {!requisito.cumplido && (
                <Link className="btn secondary" to={RUTA_REQUISITO[clave] || "/"}>Completar</Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  // Estado del Asistente de Puesta en Marcha — fetch independiente del resumen, a propósito:
  // uno no debe esperar al otro, y si este falla no debe ensuciar ni bloquear el resto del
  // dashboard (mismo criterio ya usado en useOrganizacionesAccesibles.ts: falla en silencio).
  // Sin hook propio (useEstadoOperativo) todavía — se extrae recién si aparece un segundo
  // consumidor; hoy Dashboard.tsx es el único.
  const [estadoOperativo, setEstadoOperativo] = useState<any>(null);

  useEffect(() => {
    api
      .get("/dashboard/resumen")
      .then((res) => setData(res.data))
      .catch(() => setError("No se pudo cargar el resumen"));
  }, []);

  useEffect(() => {
    let cancelado = false;
    api
      .get("/dashboard/estado-operativo")
      .then(({ data }) => {
        if (!cancelado) setEstadoOperativo(data);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="muted">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {estadoOperativo && !estadoOperativo.operativa && <AsistentePuestaEnMarcha estado={estadoOperativo} />}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="label">Viajes en curso</div>
          <div className="value">{data.viajesEnCurso}</div>
          <div className="sub">Asignados, en carga, cargados o en tránsito</div>
        </div>
        <div className="kpi-card">
          <div className="label">Viajes del mes</div>
          <div className="value">{data.viajesMes.cantidad}</div>
          <div className="sub">{data.viajesMes.toneladas.toFixed(1)} tn · {fmtMoney(data.viajesMes.importe)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Pendientes de facturar</div>
          <div className="value">{data.pendientesFacturar.cantidad}</div>
          <div className="sub">{fmtMoney(data.pendientesFacturar.importe)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Facturas vencidas</div>
          <div className="value">{data.facturasVencidas.cantidad}</div>
          <div className="sub">{fmtMoney(data.facturasVencidas.saldoPendiente)} pendiente de cobro</div>
        </div>
        <div className="kpi-card">
          <div className="label">Liquidaciones a pagar</div>
          <div className="value">{data.liquidacionesPendientesPago.cantidad}</div>
          <div className="sub">{fmtMoney(data.liquidacionesPendientesPago.importe)}</div>
        </div>
        <div className="kpi-card">
          <div className="label">Anticipos sin liquidar</div>
          <div className="value">{data.anticiposNoLiquidados.cantidad}</div>
          <div className="sub">{fmtMoney(data.anticiposNoLiquidados.importe)}</div>
        </div>
      </div>

      {data.facturasVencidas.detalle.length > 0 && (
        <div className="card">
          <div className="section-title">Facturas vencidas con saldo pendiente</div>
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Vencimiento</th>
                <th>Saldo pendiente</th>
              </tr>
            </thead>
            <tbody>
              {data.facturasVencidas.detalle.map((f: any) => (
                <tr key={f.id}>
                  <td>{f.numero}</td>
                  <td>{f.cliente}</td>
                  <td>{new Date(f.vencimiento).toLocaleDateString()}</td>
                  <td>{fmtMoney(f.saldoPendiente)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="actions-row">
        <Link className="btn" to="/viajes/nuevo">Registrar viaje</Link>
        <Link className="btn secondary" to="/liquidaciones">Ir a liquidaciones</Link>
        <Link className="btn secondary" to="/facturas/conciliacion">Ver conciliación</Link>
      </div>
    </div>
  );
}
