import { notFound } from 'next/navigation';
import { getDictionary } from '@vtk/i18n';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { ToastProvider } from '@/components/ui/toast';
import { AuthorizationPreviewBanner } from '@/components/site/AuthorizationPreviewBanner';
import { SiteAnnouncement } from '@/components/site/SiteAnnouncement';
import { HtmlLangSync } from '@/components/site/HtmlLangSync';
import { HTML_LANG, hasLocale } from '@/lib/locale';

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-site-header.css";
import "@/app/design/vtk-site-chrome.css";
import "@/app/design/vtk-immich-gallery.css";
// Het feedbackformulier hangt in de sitekop, dus op elke pagina; het
// beheerscherm eronder valt in dezelfde bundel.
import "@/app/design/vtk-feedback.css";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const skipLabel = getDictionary(locale).header.skipToContent;

  // De onboarding-/studiebevestiging-gate zit in `proxy.ts`, NIET hier: een
  // redirect vanuit deze gedeelde layout tijdens een client-side navigatie zet
  // de router in een oneindige refetch-lus. Zie `gateRedirect` in proxy.ts.

  return (
    <ToastProvider>
      <HtmlLangSync lang={HTML_LANG[locale]} />
      <a href="#main" className="vtk-skip-link">
        {skipLabel}
      </a>
      <Header locale={locale} />
      <AuthorizationPreviewBanner locale={locale} />
      <SiteAnnouncement locale={locale} />
      {/* `flex-1` + `min-h-0` pins main to viewport height and lets children overflow;
          that overflow painted over the footer. */}
      <main id="main" tabIndex={-1} className="grow outline-none" style={{ background: 'var(--paper)' }}>
        {children}
      </main>
      <Footer locale={locale} />
    </ToastProvider>
  );
}
