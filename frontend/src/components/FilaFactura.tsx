function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

export default function FilaFactura({ factura, onVerDetalle }: { factura: any; onVerDetalle: (id: string) => void }) {
  return (
    <tr>
      <td>{factura.numero}</td>
      <td>{factura.cliente?.razonSocial}</td>
      <td>{new Date(factura.fecha).toLocaleDateString()}</td>
      <td>{new Date(factura.vencimiento).toLocaleDateString()}</td>
      <td>{fmtMoney(factura.importe)}</td>
      <td><span className={`badge ${factura.estado}`}>{factura.estado}</span></td>
      <td><button className="btn secondary" onClick={() => onVerDetalle(factura.id)}>Ver</button></td>
    </tr>
  );
}
