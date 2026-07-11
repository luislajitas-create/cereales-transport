import { useState } from "react";
import { api } from "../api/client";

// Bloque 7.3.5 — esta pantalla solo presenta lo que el backend ya calculó (consumidor puro
// del Motor de Inteligencia, ver BenchmarkingController/BenchmarkingService). fmtMoney/fmtPct
// son formato de presentación, no cálculo — ningún +/-/*/ sobre importes o porcentajes acá.

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

function fmtPct(n: number | null) {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function primerDiaDelMes() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

const ETIQUETA_TENDENCIA_DIMENSION: Record<string, string> = {
  mejoro: "Mejoró",
  empeoro: "Empeoró",
  sin_cambio: "Sin cambio",
  nuevo: "Nuevo",
  desaparecido: "Desaparecido",
};

const ETIQUETA_TENDENCIA_EVOLUCION: Record<string, string> = {
  creciente: "Creciente",
  decreciente: "Decreciente",
  estable: "Estable",
};

function TablaComparacion({ titulo, filas }: { titulo: string; filas: any[] }) {
  return (
    <div className="card">
      <div className="section-title">{titulo}</div>
      <table>
        <thead><tr><th>Nombre</th><th>Margen actual</th><th>Margen anterior</th><th>Variación</th><th>Variación %</th><th>Tendencia</th></tr></thead>
        <tbody>
          {filas.map((f: any) => (
            <tr key={f.id}>
              <td>{f.nombre}</td>
              <td>{fmtMoney(f.margenActual)}</td>
              <td>{fmtMoney(f.margenAnterior)}</td>
              <td className={f.variacionAbsoluta < 0 ? "danger-text" : ""}>{fmtMoney(f.variacionAbsoluta)}</td>
              <td>{fmtPct(f.variacionPct)}</td>
              <td>{ETIQUETA_TENDENCIA_DIMENSION[f.tendencia] || f.tendencia}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={6} className="muted">Sin datos para el período seleccionado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TablaRanking({ titulo, filas }: { titulo: string; filas: any[] }) {
  return (
    <div className="card">
      <div className="section-title">{titulo}</div>
      <table>
        <thead><tr><th>Nombre</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th><th>Viajes</th></tr></thead>
        <tbody>
          {filas.map((f: any) => (
            <tr key={f.id}>
              <td>{f.nombre}</td>
              <td>{fmtMoney(f.ingreso)}</td>
              <td>{fmtMoney(f.costo)}</td>
              <td>{fmtMoney(f.margen)}</td>
              <td>{(f.margenPct || 0).toFixed(1)}%</td>
              <td>{f.viajes}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={6} className="muted">Sin datos para el período seleccionado.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function Benchmarking() {
  // Comparación entre períodos
  const [filtrosComp, setFiltrosComp] = useState({ desde: primerDiaDelMes(), hasta: hoy() });
  const [comparacion, setComparacion] = useState<any | null>(null);
  const [errorComp, setErrorComp] = useState("");
  const [cargandoComp, setCargandoComp] = useState(false);

  // Evolución mensual
  const [meses, setMeses] = useState(6);
  const [evolucion, setEvolucion] = useState<any | null>(null);
  const [errorEvol, setErrorEvol] = useState("");
  const [cargandoEvol, setCargandoEvol] = useState(false);

  // Rankings y top/bottom
  const [filtrosRank, setFiltrosRank] = useState({ desde: primerDiaDelMes(), hasta: hoy(), topN: 5 });
  const [rankings, setRankings] = useState<any | null>(null);
  const [errorRank, setErrorRank] = useState("");
  const [cargandoRank, setCargandoRank] = useState(false);

  async function buscarComparacion() {
    setErrorComp("");
    setCargandoComp(true);
    try {
      const { data } = await api.get("/inteligencia/benchmarking/comparacion", { params: { desde: filtrosComp.desde, hasta: filtrosComp.hasta } });
      setComparacion(data);
    } catch (err: any) {
      setErrorComp(err?.response?.data?.message || "No se pudo obtener la comparación entre períodos");
    } finally {
      setCargandoComp(false);
    }
  }

  async function buscarEvolucion() {
    setErrorEvol("");
    setCargandoEvol(true);
    try {
      const { data } = await api.get("/inteligencia/benchmarking/evolucion", { params: { meses } });
      setEvolucion(data);
    } catch (err: any) {
      setErrorEvol(err?.response?.data?.message || "No se pudo obtener la evolución mensual");
    } finally {
      setCargandoEvol(false);
    }
  }

  async function buscarRankings() {
    setErrorRank("");
    setCargandoRank(true);
    try {
      const { data } = await api.get("/inteligencia/benchmarking/rankings", { params: { desde: filtrosRank.desde, hasta: filtrosRank.hasta, topN: filtrosRank.topN } });
      setRankings(data);
    } catch (err: any) {
      setErrorRank(err?.response?.data?.message || "No se pudo obtener los rankings");
    } finally {
      setCargandoRank(false);
    }
  }

  return (
    <div>
      <div className="page-header"><h1>Benchmarking y Tendencias</h1></div>

      <div className="card">
        <div className="section-title">Comparación entre períodos (¿quién mejoró, quién empeoró?)</div>
        <p className="muted">Compara el período seleccionado contra el período inmediatamente anterior, de igual duración.</p>
        <div className="filters">
          <input type="date" value={filtrosComp.desde} onChange={(e) => setFiltrosComp({ ...filtrosComp, desde: e.target.value })} />
          <input type="date" value={filtrosComp.hasta} onChange={(e) => setFiltrosComp({ ...filtrosComp, hasta: e.target.value })} />
          <button className="btn" onClick={buscarComparacion} disabled={cargandoComp}>{cargandoComp ? "Calculando..." : "Comparar"}</button>
        </div>
        {errorComp && <div className="error-banner">{errorComp}</div>}
      </div>

      {comparacion && (
        <>
          <p className="muted">Período actual: {comparacion.periodoActual.desde} a {comparacion.periodoActual.hasta} — período anterior: {comparacion.periodoAnterior.desde} a {comparacion.periodoAnterior.hasta}.</p>
          <TablaComparacion titulo="Clientes" filas={comparacion.clientes} />
          <TablaComparacion titulo="Transportistas" filas={comparacion.transportistas} />
        </>
      )}

      <div className="card">
        <div className="section-title">Evolución mensual (ingreso, costo, margen)</div>
        <div className="filters">
          <input type="number" min={1} max={24} value={meses} onChange={(e) => setMeses(Number(e.target.value) || 6)} />
          <button className="btn" onClick={buscarEvolucion} disabled={cargandoEvol}>{cargandoEvol ? "Calculando..." : "Ver evolución"}</button>
        </div>
        {errorEvol && <div className="error-banner">{errorEvol}</div>}
      </div>

      {evolucion && (
        <div className="card">
          <div className="section-title">Serie mensual — tendencia de margen: {ETIQUETA_TENDENCIA_EVOLUCION[evolucion.tendenciaMargen] || evolucion.tendenciaMargen} ({fmtPct(evolucion.variacionTotalPct)} entre el primer y el último mes)</div>
          <table>
            <thead><tr><th>Período</th><th>Ingreso</th><th>Costo</th><th>Margen</th><th>Margen %</th></tr></thead>
            <tbody>
              {evolucion.serie.map((p: any, i: number) => (
                <tr key={i}>
                  <td>{p.periodo.desde} a {p.periodo.hasta}</td>
                  <td>{fmtMoney(p.ingreso)}</td>
                  <td>{fmtMoney(p.costo)}</td>
                  <td>{fmtMoney(p.margen)}</td>
                  <td>{(p.margenPct || 0).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="section-title">Rankings, Top y Bottom del período</div>
        <div className="filters">
          <input type="date" value={filtrosRank.desde} onChange={(e) => setFiltrosRank({ ...filtrosRank, desde: e.target.value })} />
          <input type="date" value={filtrosRank.hasta} onChange={(e) => setFiltrosRank({ ...filtrosRank, hasta: e.target.value })} />
          <input type="number" min={1} max={20} value={filtrosRank.topN} onChange={(e) => setFiltrosRank({ ...filtrosRank, topN: Number(e.target.value) || 5 })} title="Top/Bottom N" />
          <button className="btn" onClick={buscarRankings} disabled={cargandoRank}>{cargandoRank ? "Calculando..." : "Ver rankings"}</button>
        </div>
        {errorRank && <div className="error-banner">{errorRank}</div>}
      </div>

      {rankings && (
        <>
          <TablaRanking titulo={`Top ${filtrosRank.topN} clientes por margen`} filas={rankings.clientes.top} />
          <TablaRanking titulo={`Bottom ${filtrosRank.topN} clientes por margen`} filas={rankings.clientes.bottom} />
          <TablaRanking titulo={`Top ${filtrosRank.topN} transportistas por margen`} filas={rankings.transportistas.top} />
          <TablaRanking titulo={`Bottom ${filtrosRank.topN} transportistas por margen`} filas={rankings.transportistas.bottom} />
          <TablaRanking titulo="Ranking de cereales por margen" filas={rankings.cereales.ranking} />
          <TablaRanking titulo="Ranking de rutas por margen" filas={rankings.rutas.ranking} />
        </>
      )}
    </div>
  );
}
