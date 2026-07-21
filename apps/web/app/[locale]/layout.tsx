import { notFound } from 'next/navigation';
import { Header } from '@/components/site/Header';
import { Footer } from '@/components/site/Footer';
import { ToastProvider } from '@/components/ui/toast';
import { AuthorizationPreviewBanner } from '@/components/site/AuthorizationPreviewBanner';
import { hasLocale } from '@/lib/locale';

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

  // De onboarding-/studiebevestiging-gate zit in `proxy.ts`, NIET hier: een
  // redirect vanuit deze gedeelde layout tijdens een client-side navigatie zet
  // de router in een oneindige refetch-lus. Zie `gateRedirect` in proxy.ts.

  return (
    <ToastProvider>
      <Header locale={locale} />
      <AuthorizationPreviewBanner locale={locale} />
      {/* `flex-1` + `min-h-0` pins main to viewport height and lets children overflow;
          that overflow painted over the footer looked like “footer in the hero”. */}
      <main className="grow" style={{ background: 'var(--paper)' }}>
        {children}
      </main>
      <Footer locale={locale} />
    </ToastProvider>
  );
}
