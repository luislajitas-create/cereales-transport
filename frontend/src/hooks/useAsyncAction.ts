import { useCallback, useRef, useState } from "react";

interface RunOptions<T> {
  successMessage?: string | ((result: T) => string);
  errorMessage?: string;
}

/**
 * Ejecuta una acción async con busy/error/success compartidos.
 * El guard de doble-submit usa un ref (no el estado `busy`) para que dos clics
 * disparados en el mismo tick -antes del primer re-render- no pasen ambos.
 */
export function useAsyncAction() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const run = useCallback(async <T,>(fn: () => Promise<T>, opts?: RunOptions<T>): Promise<T | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await fn();
      if (opts?.successMessage) {
        setSuccess(typeof opts.successMessage === "function" ? opts.successMessage(result) : opts.successMessage);
      }
      return result;
    } catch (err: any) {
      setError(err?.response?.data?.message || opts?.errorMessage || "No se pudo completar la acción");
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, success, setError, setSuccess, run };
}
