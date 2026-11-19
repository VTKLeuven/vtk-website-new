"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import Link from "@/components/ui/Link";

/**
 * De zoekknop in de sitekop, plus Ctrl+K / Cmd+K om te zoeken vanaf elke
 * publieke pagina.
 *
 * Zoeken is op de publieke site een pagina (/zoeken, waar de cursor meteen in
 * het veld staat) en geen dialoog, dus de sneltoets gaat daarheen. Sta je al op
 * /zoeken, dan zet ze de cursor terug in het veld en selecteert ze wat er staat.
 *
 * Twee uitzonderingen:
 * - In de admin doet ze niets. Daar opent dezelfde sneltoets de zoekbalk van de
 *   zijbalk (`AdminNavSearch` in @vtk/ui), en die slaat een toets over waarop
 *   iemand anders al `preventDefault` riep. Deze kop staat ook boven de admin,
 *   dus zonder deze regel zou de site-zoekpagina de admin-zoekbalk verdringen.
 * - Niet terwijl iemand in een veld typt. In de admin opent Ctrl+K een dialoog
 *   die je weer sluit; hier is het een andere pagina, en die zou een half
 *   ingevuld formulier weggooien. Een Markdown-editor gebruikt Ctrl+K bovendien
 *   voor een link.
 */

/** Mod+K, zoals in de admin (`isSearchShortcut` in packages/ui/src/AdminNavSearch.tsx). */
function isSearchShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.altKey || event.shiftKey || event.isComposing) return false;
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
}

/** Invoertypes waarin je niet typt; een zoekveld telt hier ook bij. */
const NON_TYPING_INPUTS = new Set([
  "search",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "file",
  "range",
  "color",
  "image",
]);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TYPING_INPUTS.has(target.type);
  return false;
}

const ADMIN_PATH = /^(?:\/(?:nl|en))?\/admin(?:\/|$)/;
const SEARCH_PATH = /^(?:\/(?:nl|en))?\/zoeken\/?$/;

const noSubscribe = () => () => {};

/**
 * "⌘K" of "Ctrl K", voor de tooltip. Op de server en in de eerste render null,
 * zodat de HTML overal dezelfde is; de hint verschijnt na het hydrateren.
 */
function useShortcutLabel(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K"),
    () => null
  );
}

export function SiteSearchButton({ base, label }: { base: string; label: string }) {
  const router = useRouter();
  const shortcut = useShortcutLabel();
  const href = `${base}/zoeken`;

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!isSearchShortcut(event)) return;
    const path = window.location.pathname;
    if (ADMIN_PATH.test(path) || isTyping(event.target)) return;
    event.preventDefault();
    if (SEARCH_PATH.test(path)) {
      // Het veld van de pagina zelf, niet dat in het uitklapmenu van de kop.
      const input = document.querySelector<HTMLInputElement>("main .vtk-search-input");
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }
    router.push(href);
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <Link href={href} aria-label={label} title={title} aria-keyshortcuts="Control+K Meta+K" className="nav-search">
      <Search aria-hidden="true" size={18} />
    </Link>
  );
}
