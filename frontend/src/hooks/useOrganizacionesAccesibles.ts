import { useEffect, useState } from "react";
import { api } from "../api/client";

interface OrganizacionAccesible {
  id: string;
  nombre: string;
  esActual: boolean;
}

// Bloque 10.4.b — consulta GET /grupo-economico/organizaciones-accesibles (10.4.a, cerrado) una
// sola vez por montaje del selector. No persiste el resultado en localStorage ni en ningún otro
// lado (DISENO_BLOQUE10.4b_FRONTEND.md, sección 2) — es una consulta, no un dato de sesión. Ante
// un error, falla en silencio: el llamador no muestra el selector, sin bloquear el resto de
// Layout (DISENO_BLOQUE10.4b_FRONTEND.md, sección 7).
export function useOrganizacionesAccesibles() {
  const [organizaciones, setOrganizaciones] = useState<OrganizacionAccesible[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    api
      .get("/grupo-economico/organizaciones-accesibles")
      .then(({ data }) => {
        if (!cancelado) setOrganizaciones(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  return { organizaciones, loading };
}
