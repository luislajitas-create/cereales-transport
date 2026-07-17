import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../api/client";

interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  organizacionId: string;
}

interface AuthContextType {
  usuario: Usuario | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  cambiarOrganizacion: (organizacionId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("usuario");
    if (stored) {
      try {
        setUsuario(JSON.parse(stored));
      } catch {
        localStorage.removeItem("usuario");
      }
    }
    setLoading(false);
  }, []);

  // Bloque 10.4.b — sincronización entre pestañas (DECISIONES_TECNICAS_BLOQUE10.4b.md,
  // Decisión 1). Escucha exclusivamente la clave "token" (la última que escribe
  // cambiarOrganizacion(), señal de que el cambio ya está completo) y recarga la pestaña en su
  // URL actual — nunca redirige a "/", la pestaña pasiva no tomó ninguna decisión de navegación.
  useEffect(() => {
    function handler(event: StorageEvent) {
      if (event.key === "token" && event.newValue !== event.oldValue) {
        window.location.reload();
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.accessToken);
    localStorage.setItem("usuario", JSON.stringify(data.usuario));
    setUsuario(data.usuario);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    setUsuario(null);
  }

  // Bloque 10.4.b — cambio de organización activa (DISENO_BLOQUE10.4b_FRONTEND.md, sección 4).
  // Escribe "usuario" primero y "token" al final (DECISIONES_TECNICAS_BLOQUE10.4.md, Decisión 6)
  // — el listener de arriba reacciona solo a "token". Si cualquiera de las dos escrituras falla,
  // revierte a los valores originales y no recarga. No actualiza el estado de React antes de
  // recargar — la recarga reconstruye todo desde cero.
  async function cambiarOrganizacion(organizacionId: string) {
    const { data } = await api.post("/auth/cambiar-organizacion", { organizacionId });

    const tokenOriginal = localStorage.getItem("token");
    const usuarioOriginal = localStorage.getItem("usuario");

    try {
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      localStorage.setItem("token", data.accessToken);
    } catch (err) {
      if (usuarioOriginal !== null) localStorage.setItem("usuario", usuarioOriginal);
      else localStorage.removeItem("usuario");
      if (tokenOriginal !== null) localStorage.setItem("token", tokenOriginal);
      else localStorage.removeItem("token");
      throw err;
    }

    window.location.href = "/";
  }

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout, cambiarOrganizacion }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
