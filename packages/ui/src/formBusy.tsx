"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

/**
 * Laat een veld in een formulier melden dat het nog bezig is, zodat de
 * omliggende `SaveForm` niet kan verzenden voor het klaar is.
 *
 * Dit bestaat omdat een veld dat asynchroon zijn waarde ophaalt (een upload die
 * pas achteraf een storage-key oplevert) anders een half formulier laat
 * verzenden: de verborgen key is dan nog leeg, de action bewaart "geen foto", en
 * de gebruiker ziet toch de preview van zijn upload plus een groene
 * "Opgeslagen"-toast. Het veld weet dat het bezig is, de knop hoort bij het
 * formulier; deze context verbindt de twee.
 */

type Register = (id: string, busy: boolean) => void;

const FormBusyContext = createContext<Register | null>(null);

/** Meld vanuit een veld dat het bezig is. Buiten een `SaveForm` doet dit niets. */
export function useReportFormBusy(busy: boolean): void {
  const register = useContext(FormBusyContext);
  const id = useId();

  useEffect(() => {
    if (!register) return;
    register(id, busy);
    return () => register(id, false);
  }, [register, id, busy]);
}

/** Voor `SaveForm`: houdt bij of een van de velden nog bezig is. */
export function useFormBusy(): { busy: boolean; register: Register } {
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  const register = useCallback<Register>((id, busy) => {
    setBusyIds((current) => {
      if (busy === current.has(id)) return current;
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return { busy: busyIds.size > 0, register };
}

export function FormBusyProvider({
  register,
  children,
}: {
  register: Register;
  children: ReactNode;
}) {
  return <FormBusyContext.Provider value={register}>{children}</FormBusyContext.Provider>;
}
