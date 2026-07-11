import { useEffect, useState } from "react";
import { api } from "../api/client";

// Bloque 7.3.3.a — esta pantalla solo presenta lo que el backend ya calculó, severidad
// incluida (BLOQUE7.3.3a_DISENO_ALERTAS.md, sección 12). Sin botón de descarte (sección 1.3):
// las alertas no son persistentes, desaparecen solas cuando la causa se resuelve.

const ETIQUETA_TIPO: Record<string, string> = {
  factura_vencida: "Factura vencida",
  factura_proxima_vencer: "Factura próxima a vencer",
  cliente_deuda_vencida: "Cliente con deuda vencida elevada",
  concentracion_cliente: "Concentración de deuda en un cliente",
  anticipo_sin_liquidar: "Anticipo sin liquidar",
  chofer_anticipos_altos: "Chofer con anticipos acumulados altos",
  viaje_sin_facturar: "Viaje sin facturar",
  viaje_sin_liquidar: "Viaje sin liquidar",
  viaje_estancado: "Viaje estancado",
};

const ORDEN_SEVERIDAD: Record<string, number> = { critica: 0, preventiva: 1, informativa: 2 };

export default function Alertas() {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function buscar() {
    setError("");
    setCargando(true);
    try {
      const { data: res } = await api.get("/inteligencia/alertas");
      setData(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudieron obtener las alertas");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    buscar();
  }, []);

  const grupos: Record<string, any[]> = {};
  if (data) {
    for (const a of data.alertas) {
      if (!grupos[a.tipo]) grupos[a.tipo] = [];
      grupos[a.tipo].push(a);
    }
    for (const tipo of Object.keys(grupos)) {
      grupos[tipo].sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Centro de Alertas</h1>
        <button className="btn secondary" onClick={buscar} disabled={cargando}>{cargando ? "Actualizando..." : "Actualizar"}</button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          <div className="card">
            <div className="section-title">Resumen a la fecha ({data.fechaCorte})</div>
            <table>
              <thead><tr><th>Total</th><th>Críticas</th><th>Preventivas</th><th>Informativas</th></tr></thead>
              <tbody>
                <tr>
                  <td>{data.resumen.total}</td>
                  <td className={data.resumen.criticas > 0 ? "danger-text" : ""}>{data.resumen.criticas}</td>
                  <td>{data.resumen.preventivas}</td>
                  <td>{data.resumen.informativas}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {data.viajesRentabilidadIncompleta.total > 0 && (
            <div className="card">
              <div className="section-title">Contexto: viajes con Rentabilidad incompleta</div>
              <p className="muted">
                {data.viajesRentabilidadIncompleta.total} viaje(s) todavía no tienen ambos lados materializados —
                {" "}{data.viajesRentabilidadIncompleta.sinFacturar} sin facturar, {data.viajesRentabilidadIncompleta.sinLiquidar} sin liquidar,
                {" "}{data.viajesRentabilidadIncompleta.ambos} sin ninguno de los dos. Este resumen no es una alerta propia — ver el detalle en
                "Viaje sin facturar" / "Viaje sin liquidar" más abajo.
              </p>
            </div>
          )}

          {Object.keys(grupos).length === 0 && (
            <div className="card"><p className="muted">Sin alertas activas.</p></div>
          )}

          {Object.entries(grupos).map(([tipo, alertas]) => (
            <div className="card" key={tipo}>
              <div className="section-title">{ETIQUETA_TIPO[tipo] || tipo} ({alertas.length})</div>
              <table>
                <thead><tr><th>Severidad</th><th>Entidad</th><th>Mensaje</th></tr></thead>
                <tbody>
                  {alertas.map((a: any, i: number) => (
                    <tr key={`${a.entidadId}-${i}`}>
                      <td className={a.severidad === "critica" ? "danger-text" : ""}>{a.severidad}</td>
                      <td>{a.entidadNombre}</td>
                      <td>{a.mensaje}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
