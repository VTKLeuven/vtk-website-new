"use client";

import { useEffect } from "react";

/**
 * Synchroniseert `document.documentElement.lang` na client-side navigaties
 * tussen `/` en `/en/...`, omdat `RootLayout` boven `[locale]` enkel bij SSR
 * opnieuw gerenderd wordt.
 */
export function HtmlLangSync({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
