import { Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Centraliza el guard por rol que antes se repetía, idéntico, en 6 pantallas administrativas
// (Usuarios, AuditoriaAdministrativa, GrupoEconomico, PagosConsolidados, PagoConsolidadoNuevo,
// PagoConsolidadoDetalle). Es una mejora de mantenibilidad, no de seguridad — el backend ya
// rechaza estas operaciones con @Roles() independientemente de esto; acá solo evita el flash de
// contenido/llamadas a la API si alguien navega directo por URL sin el rol correcto.
export default function ProtectedRoute({ roles }: { roles: string[] }) {
  const { usuario } = useAuth();

  if (!usuario || !roles.includes(usuario.rol)) {
    return (
      <div>
        <div className="page-header"><h1>Acceso restringido</h1></div>
        <div className="error-banner">No tenés permiso para ver esta sección.</div>
      </div>
    );
  }

  return <Outlet />;
}
