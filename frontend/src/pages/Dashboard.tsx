import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/resumen")
      .then((res) => setData(res.data))
      .catch(() => setError("No se pudo cargar el resumen"));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="muted">Cargando...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

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
