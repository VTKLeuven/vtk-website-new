import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDictionary } from "@vtk/i18n";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { NotFoundView } from "@/components/site/NotFoundView";
import { ToastProvider } from "@/components/ui/toast";
import { localeFromPath } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-site-header.css";
import "@/app/design/vtk-site-chrome.css";

/**
 * De 404 voor een adres dat op geen enkele route valt, bijvoorbeeld
 * `/nl/een/pad/te/diep`. Die komt niet in `[locale]` terecht, dus niet in de
 * layout daar: kop, voet en de ontwerp-CSS staan hier zelf. Zonder dat zou deze
 * pagina als kale HTML op het scherm komen, en juist een bezoeker die al
 * verdwaald is heeft de navigatie het hardst nodig.
 */
async function requestPath(): Promise<string> {
  const h = await headers();
  return h.get("x-pathname") || "/";
}

export async function generateMetadata(): Promise<Metadata> {
  const path = await requestPath();
  const locale = localeFromPath(path);
  const t = getDictionary(locale).notFound;
  return buildMetadata({
    title: t.title,
    description: t.lead,
    path,
    locale,
    noIndex: true,
  });
}

export default async function RootNotFound() {
  const locale = localeFromPath(await requestPath());
  return (
    <ToastProvider>
      <Header locale={locale} />
      <main className="grow" style={{ background: "var(--paper)" }}>
        <NotFoundView locale={locale} />
      </main>
      <Footer locale={locale} />
    </ToastProvider>
  );
}
