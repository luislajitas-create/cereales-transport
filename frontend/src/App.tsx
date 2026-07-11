import { Routes, Route } from "react-router-dom";
import { ConfirmProvider } from "./components/ConfirmDialog";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Viajes from "./pages/Viajes";
import ViajeForm from "./pages/ViajeForm";
import ViajeDetalle from "./pages/ViajeDetalle";
import Clientes from "./pages/Clientes";
import Transportistas from "./pages/Transportistas";
import Catalogos from "./pages/Catalogos";
import Anticipos from "./pages/Anticipos";
import Liquidaciones from "./pages/Liquidaciones";
import Facturas from "./pages/Facturas";
import Conciliacion from "./pages/Conciliacion";
import Rentabilidad from "./pages/Rentabilidad";
import Aging from "./pages/Aging";

export default function App() {
  return (
    <ConfirmProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/viajes" element={<Viajes />} />
          <Route path="/viajes/nuevo" element={<ViajeForm />} />
          <Route path="/viajes/:id" element={<ViajeDetalle />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/transportistas" element={<Transportistas />} />
          <Route path="/catalogos" element={<Catalogos />} />
          <Route path="/anticipos" element={<Anticipos />} />
          <Route path="/liquidaciones" element={<Liquidaciones />} />
          <Route path="/facturas" element={<Facturas />} />
          <Route path="/facturas/conciliacion" element={<Conciliacion />} />
          <Route path="/inteligencia/rentabilidad" element={<Rentabilidad />} />
          <Route path="/inteligencia/cobranzas/aging" element={<Aging />} />
        </Route>
      </Routes>
    </ConfirmProvider>
  );
}
