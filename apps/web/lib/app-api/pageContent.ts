import "server-only";

import type { Locale } from "@vtk/i18n";

import { outlineFromMarkdown, type OutlineItem } from "@/lib/pageOutline";
import { tiptapToMarkdown } from "@/lib/tiptap-to-markdown";

/**
 * De inhoud van een contentpagina als Markdown, in één formaat.
 *
 * Op de site staan pagina's in twee vormen: Markdown (het huidige formaat) en
 * oudere tiptap-JSON-documenten. `PageView` rendert die allebei met een eigen
 * renderer. De app zou dat kunnen nadoen, maar dan zou ze een JSON-formaat moeten
 * kennen dat de site zelf aan het uitfaseren is; dus zetten we het hier om.
 *
 * De terugvalregels zijn identiek aan die van `PageView`: **Markdown is de bron
 * van waarheid.** Zodra een taal een markdown-waarde heeft, ook een lege, telt
 * het tiptap-JSON van die taal niet meer mee. Een taal zonder eigen versie valt
 * terug op het Nederlands.
 */
export type PageContentSource = {
  contentMdNl: string | null;
  contentMdEn: string | null;
  contentJsonNl: unknown;
  contentJsonEn: unknown;
};

export function pageContentMarkdown(page: PageContentSource, locale: Locale): string {
  if (locale === "en") {
    if (page.contentMdEn !== null) return page.contentMdEn;
    if (page.contentJsonEn) return tiptapToMarkdown(page.contentJsonEn);
  }
  if (page.contentMdNl !== null) return page.contentMdNl;
  return tiptapToMarkdown(page.contentJsonNl);
}

/**
 * De kopjes van de getoonde taalversie.
 *
 * Afgeleid uit dezelfde Markdown die de app krijgt, en niet uit
 * `outlineFromTiptap`: zo horen de ankers die de app tekent per definitie bij de
 * tekst die ze rendert. Bij een omgezet tiptap-document zou dat anders uit elkaar
 * kunnen lopen.
 */
export function pageOutline(page: PageContentSource, locale: Locale): OutlineItem[] {
  return outlineFromMarkdown(pageContentMarkdown(page, locale));
}
