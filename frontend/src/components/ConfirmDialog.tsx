import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message: string;
  severity?: "medium" | "high";
  confirmLabel?: string;
  cancelLabel?: string;
  /** Muestra un textarea obligatorio (reemplaza a window.prompt para motivos de anulación/cancelación). */
  requireMotivo?: boolean;
  /** Si se define, el usuario debe tipear exactamente este valor para habilitar el botón de confirmar. */
  requireTypedValue?: string;
  typedValueLabel?: string;
}

export interface ConfirmResult {
  confirmed: boolean;
  motivo?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (result: ConfirmResult) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [motivo, setMotivo] = useState("");
  const [typedValue, setTypedValue] = useState("");

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<ConfirmResult>((resolve) => {
      setMotivo("");
      setTypedValue("");
      setPending({ ...options, resolve });
    });
  }, []);

  function close(result: ConfirmResult) {
    pending?.resolve(result);
    setPending(null);
  }

  const motivoOk = !pending?.requireMotivo || motivo.trim().length > 0;
  const typedOk = !pending?.requireTypedValue || typedValue.trim() === pending.requireTypedValue.trim();
  const canConfirm = motivoOk && typedOk;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="confirm-overlay" onClick={() => close({ confirmed: false })}>
          <div
            className={`confirm-dialog${pending.severity === "high" ? " high" : ""}`}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{pending.title}</h2>
            <p>{pending.message}</p>
            {pending.requireMotivo && (
              <div className="field">
                <label>Motivo</label>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus />
              </div>
            )}
            {pending.requireTypedValue && (
              <div className="field">
                <label>{pending.typedValueLabel || `Escribí "${pending.requireTypedValue}" para confirmar`}</label>
                <input value={typedValue} onChange={(e) => setTypedValue(e.target.value)} autoFocus />
              </div>
            )}
            <div className="actions-row">
              <button className="btn secondary" onClick={() => close({ confirmed: false })}>
                {pending.cancelLabel || "Cancelar"}
              </button>
              <button
                className={`btn ${pending.severity === "high" ? "danger" : "success"}`}
                disabled={!canConfirm}
                onClick={() => close({ confirmed: true, motivo: pending.requireMotivo ? motivo.trim() : undefined })}
              >
                {pending.confirmLabel || "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx;
}
