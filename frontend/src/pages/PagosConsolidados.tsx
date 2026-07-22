import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

interface Grupo {
  id: string;
  nombre: string;
  organizaciones: { id: string; nombre: string }[];
}

interface Identidad {
  id: string;
  nombreReferencia: string;
}

interface Pago {
  id: string;
  identidadChoferGrupoId: string;
  estado: string;
  totalConsolidado: number;
  referenciaPago: string | null;
  createdAt: string;
  liquidaciones: { organizacionId: string }[];
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);
}

// Bloque 10.6 — DECISIONES_TECNICAS_BLOQUE10.6_PAGO_CONSOLIDADO.md, sección 4: pantalla de nivel
// de grupo, nunca atada a la organización activa. Sección 13: si listar() devuelve 403 por falta
// de acceso a alguna organización de CUALQUIER pago del grupo, se muestra un error específico —
// sin construir ningún parche del lado del cliente para sortearlo.
export default function PagosConsolidados() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [cargandoGrupo, setCargandoGrupo] = useState(true);
  const [errorGrupo, setErrorGrupo] = useState("");
  const [grupo, setGrupo] = useState<Grupo | null>(null);

  const [identidades, setIdentidades] = useState<Identidad[]>([]);

  const [cargandoPagos, setCargandoPagos] = useState(false);
  const [errorPagos, setErrorPagos] = useState("");
  const [pagos, setPagos] = useState<Pago[]>([]);

  useEffect(() => {
    if (usuario?.rol !== "ADMINISTRADOR") return;
    let cancelado = false;
    setCargandoGrupo(true);
    setErrorGrupo("");
    Promise.all([api.get("/grupo-economico"), api.get("/grupo-economico/choferes/identidades")])
      .then(([grupoRes, identidadesRes]) => {
        if (cancelado) return;
        setGrupo(grupoRes.data);
        setIdentidades(identidadesRes.data);
      })
      .catch((err) => {
        if (!cancelado) setErrorGrupo(err?.response?.data?.message || "No se pudo cargar el grupo económico.");
      })
      .finally(() => {
        if (!cancelado) setCargandoGrupo(false);
      });
    return () => {
      cancelado = true;
    };
  }, [usuario]);

  useEffect(() => {
    if (!grupo) return;
    let cancelado = false;
    setCargandoPagos(true);
    setErrorPagos("");
    api
      .get(`/grupo-economico/${grupo.id}/pagos-consolidados`)
      .then((res) => {
        if (!cancelado) setPagos(res.data);
      })
      .catch((err) => {
        if (!cancelado) setErrorPagos(err?.response?.data?.message || "No se pudo cargar el listado de pagos consolidados.");
      })
      .finally(() => {
        if (!cancelado) setCargandoPagos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [grupo]);

  function nombreBeneficiario(identidadChoferGrupoId: string) {
    return identidades.find((i) => i.id === identidadChoferGrupoId)?.nombreReferencia || "—";
  }

  function cantidadOrganizaciones(pago: Pago) {
    return new Set(pago.liquidaciones.map((l) => l.organizacionId)).size;
  }

  if (usuario?.rol !== "ADMINISTRADOR") {
    return (
      <div>
        <div className="page-header"><h1>Pago Consolidado</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  if (cargandoGrupo) {
    return (
      <div>
        <div className="page-header"><h1>Pago Consolidado</h1></div>
        <p className="muted">Cargando...</p>
      </div>
    );
  }

  if (errorGrupo) {
    return (
      <div>
        <div className="page-header"><h1>Pago Consolidado</h1></div>
        <div className="error-banner">{errorGrupo}</div>
      </div>
    );
  }

  if (!grupo) {
    return (
      <div>
        <div className="page-header"><h1>Pago Consolidado</h1></div>
        <p className="muted">Tu organización no pertenece a ningún grupo económico.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Pago Consolidado</h1>
        <button className="btn" onClick={() => navigate("/administracion/pago-consolidado/nuevo")}>
          Nuevo pago consolidado
        </button>
      </div>
      <p className="muted">Grupo: {grupo.nombre}</p>

      <div className="card">
        <div className="section-title">Pagos consolidados</div>
        {errorPagos && <div className="error-banner">{errorPagos}</div>}
        {cargandoPagos && <p className="muted">Cargando...</p>}
        {!cargandoPagos && !errorPagos && pagos.length === 0 && (
          <p className="muted">No hay pagos consolidados todavía.</p>
        )}
        {!cargandoPagos && !errorPagos && pagos.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Beneficiario</th>
                <th>Estado</th>
                <th className="num">Total</th>
                <th className="num">Organizaciones</th>
                <th>Referencia</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td>{nombreBeneficiario(p.identidadChoferGrupoId)}</td>
                  <td><span className={`badge ${p.estado}`}>{p.estado}</span></td>
                  <td className="num">{fmtMoney(p.totalConsolidado)}</td>
                  <td className="num">{cantidadOrganizaciones(p)}</td>
                  <td>{p.referenciaPago || "—"}</td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>
                    <button className="btn secondary" onClick={() => navigate(`/administracion/pago-consolidado/${p.id}`)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
