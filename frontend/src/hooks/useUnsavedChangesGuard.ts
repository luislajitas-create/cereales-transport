import { useEffect } from "react";

// Bloque 10.4.b — hook mínimo y genérico, sin registro global de formularios sucios
// (DECISIONES_TECNICAS_BLOQUE10.4b.md, Decisión 2). Cada pantalla que lo adopte le pasa su
// propio booleano; hoy, únicamente ViajeForm.tsx. Se dispara ante cualquier intento de descargar
// la página, sin distinguir si lo originó la propia pestaña o el listener de "storage" de otra
// pestaña — es, estructuralmente, el mismo evento nativo en ambos casos.
export function useUnsavedChangesGuard(hayCambiosSinGuardar: boolean) {
  useEffect(() => {
    if (!hayCambiosSinGuardar) return;

    function handler(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hayCambiosSinGuardar]);
}
