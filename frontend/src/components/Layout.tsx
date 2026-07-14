import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", roles: null },
  { to: "/viajes", label: "Viajes", roles: null },
  { to: "/anticipos", label: "Anticipos y Gastos", roles: ["ADMINISTRADOR", "LIQUIDACIONES", "OPERACIONES"] },
  { to: "/liquidaciones", label: "Liquidaciones", roles: ["ADMINISTRADOR", "LIQUIDACIONES", "GERENCIA"] },
  { to: "/facturas", label: "Facturación", roles: ["ADMINISTRADOR", "FACTURACION", "GERENCIA"] },
  { to: "/facturas/conciliacion", label: "Conciliación", roles: ["ADMINISTRADOR", "FACTURACION", "GERENCIA"] },
  { to: "/inteligencia/dashboard", label: "Dashboard Ejecutivo", roles: ["ADMINISTRADOR", "GERENCIA"] },
  { to: "/inteligencia/rentabilidad", label: "Rentabilidad", roles: ["ADMINISTRADOR", "GERENCIA"] },
  { to: "/inteligencia/cobranzas/aging", label: "Aging de Cobranzas", roles: ["ADMINISTRADOR", "GERENCIA", "FACTURACION"] },
  { to: "/inteligencia/alertas", label: "Centro de Alertas", roles: ["ADMINISTRADOR", "GERENCIA", "FACTURACION", "LIQUIDACIONES", "OPERACIONES"] },
  { to: "/inteligencia/benchmarking", label: "Benchmarking y Tendencias", roles: ["ADMINISTRADOR", "GERENCIA"] },
  { to: "/clientes", label: "Clientes", roles: null },
  { to: "/transportistas", label: "Transportistas", roles: null },
  { to: "/catalogos", label: "Catálogos", roles: ["ADMINISTRADOR", "OPERACIONES"] },
  { to: "/organizacion", label: "Mi Organización", roles: null },
  { to: "/administracion/usuarios", label: "Usuarios", roles: ["ADMINISTRADOR"] },
  { to: "/administracion/auditoria", label: "Auditoría Administrativa", roles: ["ADMINISTRADOR"] },
];

export default function Layout() {
  const { usuario, loading, logout } = useAuth();

  if (loading) return <div style={{ padding: "2rem" }}>Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;

  const items = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(usuario.rol));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Dador de Carga</h2>
        <nav>
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="user-info">
          <div>{usuario.nombre}</div>
          <div className="muted">{usuario.rol}</div>
          <NavLink to="/perfil">Mi perfil</NavLink>
          <button onClick={logout}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
