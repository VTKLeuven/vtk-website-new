'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import './toast.css';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export type ToastInput = {
  message: string;
  /** Visuele stijl. Standaard `info`. */
  variant?: ToastVariant;
  /**
   * Auto-verdwijntijd in ms. `0` = blijft staan tot manueel gesloten. Standaard
   * 4000, en 8000 met een `action`: wie "Ongedaan maken" leest, moet nog tijd
   * hebben om erop te klikken.
   */
  duration?: number;
  /**
   * Eén knop in de melding, zoals "Ongedaan maken" na een sleep. Een klik voert
   * ze uit en sluit de melding.
   */
  action?: { label: string; onClick: () => void };
};

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: { label: string; onClick: () => void };
};

type ShowToast = (input: ToastInput) => void;

const DEFAULT_DURATION = 4000;
const ACTION_DURATION = 8000;

const ToastContext = createContext<ShowToast | null>(null);

/**
 * Geeft een `showToast(...)`-functie terug om een pop-upmelding te tonen.
 * Moet binnen een {@link ToastProvider} gebruikt worden.
 */
export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}

/**
 * Levert de toast-context en rendert de meldingen rechtsboven, bovenop de rest
 * van de pagina. Plaats dit één keer hoog in de boom (bvb in de layout).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback<ShowToast>(
    ({ message, variant = 'info', action, duration = action ? ACTION_DURATION : DEFAULT_DURATION }) => {
      const id = ++nextId.current;
      setToasts((cur) => [...cur, { id, message, variant, action }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="vtk-toast-viewport" role="region" aria-live="polite" aria-label="Meldingen">
        {toasts.map((toast) => (
          <div key={toast.id} className={`vtk-toast vtk-toast-${toast.variant}`} role="status">
            <span className="vtk-toast-message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="vtk-toast-action"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="vtk-toast-close"
              aria-label="Sluiten"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
