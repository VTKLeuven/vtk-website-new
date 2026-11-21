"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@vtk/i18n";

export type AiTranslateContextValue = {
  /** Of er server-side een AI-endpoint geconfigureerd is (bepaalt of knoppen tonen). */
  enabled: boolean;
  /** Huidige UI-taal van de admin. */
  locale: Locale;
};

const AiTranslateContext = createContext<AiTranslateContextValue>({
  enabled: false,
  locale: "nl",
});

/**
 * Geplaatst rond `/admin` in `admin/layout.tsx`. Zo weet elke `SaveForm` in het
 * beheer meteen of AI-vertaling aan staat, zonder extra props per pagina en
 * zonder ooit vertaalknoppen op publieke formulieren te tonen.
 */
export function AiTranslateProvider({
  enabled,
  locale,
  children,
}: {
  enabled: boolean;
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <AiTranslateContext.Provider value={{ enabled, locale }}>
      {children}
    </AiTranslateContext.Provider>
  );
}

export function useAiTranslateConfig(): AiTranslateContextValue {
  return useContext(AiTranslateContext);
}
