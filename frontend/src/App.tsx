import { Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
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
      </Route>
    </Routes>
  );
}
