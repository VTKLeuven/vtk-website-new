import { notFound } from "next/navigation";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { hasLocale } from "@/lib/locale";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-site-header.css";
import "@/app/design/vtk-site-chrome.css";
import "@/app/design/vtk-immich-gallery.css";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  return (
    <>
      <Header locale={locale} />
      {/* `flex-1` + `min-h-0` pins main to viewport height and lets children overflow;
          that overflow painted over the footer looked like “footer in the hero”. */}
      <main className="grow" style={{ background: "var(--paper)" }}>
        {children}
      </main>
      <Footer locale={locale} />
    </>
  );
}
