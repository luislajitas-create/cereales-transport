import { fmtFechaCalendario } from "../utils/fecha";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function FilaLiquidacion({ liquidacion, onVerDetalle }: { liquidacion: any; onVerDetalle: (id: string) => void }) {
  return (
    <tr>
      <td>{liquidacion.numero}</td>
      <td>{liquidacion.tipo}</td>
      <td>{liquidacion.transportista?.razonSocial || liquidacion.chofer?.nombre}</td>
      <td>{fmtFechaCalendario(liquidacion.periodoDesde)} - {fmtFechaCalendario(liquidacion.periodoHasta)}</td>
      <td className="num">{fmtMoney(liquidacion.netoPagar)}</td>
      <td><span className={`badge ${liquidacion.estado}`}>{liquidacion.estado}</span></td>
      <td><button className="btn secondary" onClick={() => onVerDetalle(liquidacion.id)}>Ver</button></td>
    </tr>
  );
}
