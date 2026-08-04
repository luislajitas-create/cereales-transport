import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // DEV-1: sin esto, si el 5173 está ocupado Vite arranca "silenciosamente" en 5174/5175/...
    // — el usuario termina sin saber en qué puerto quedó, o con múltiples instancias vivas
    // en puertos distintos (el problema real detectado durante FAC-3/FAC-4). strictPort hace
    // que Vite falle con un mensaje claro en vez de elegir otro puerto por su cuenta.
    strictPort: true,
  },
});
