import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { ToastProvider } from "@vtk/ui/toast";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy, getLocale } from "@/lib/i18n";
import { THEME_SCRIPT } from "@/lib/theme-shared";
import { analyticsConfigFromEnv, analyticsScript } from "@/lib/analytics";
import "./globals.css";

const inter = Inter({ variable: "--font-vtk-sans", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: copy[locale].appTitle,
    description: copy[locale].appDescription,
    icons: {
      icon: [
        {
          url: "/vtk-shield-favicon-32.png",
          type: "image/png",
          sizes: "32x32",
        },
        {
          url: "/vtk-shield-favicon.png",
          type: "image/png",
          sizes: "512x512",
        },
      ],
      shortcut: "/vtk-shield-favicon-32.png",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const analytics = analyticsScript(analyticsConfigFromEnv());

  return (
    /* suppressHydrationWarning: het script hieronder zet `data-theme` op <html>
       voor React hydrateert, dus het attribuut verschilt per definitie van wat de
       server rendert. Zonder dit waarschuwt React daarover bij elke lading. */
    <html lang={locale} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-vtk-paper text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        {/* Als eerste in de body en niet via next/script: dit moet lopen voor de
            browser de eerste pixel tekent, anders flitst elke pagina wit op. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Enkel de cookieloze teller, geen sessie-opname (S2). De recorder van
            Umami liep hier op elke pagina, ook in het beheer en op de ritten,
            waar namen, telefoonnummers en adressen staan, zonder dat iemand er
            toestemming voor gaf. vtk.be gebruikt hem nergens. */}
        {analytics && (
          <Script
            strategy="afterInteractive"
            src={analytics.src}
            data-website-id={analytics.websiteId}
            data-exclude-search="true"
            data-exclude-hash="true"
            data-performance="true"
          />
        )}
        {/* Eén meldingsstapel voor de hele app. Die stond enkel rond /beheer en
            per blok op een paar ledenpagina's; daarbuiten had de melding van
            een opslag die de server nooit bereikte (`unsentGuard`) geen plek. */}
        <ToastProvider labels={copy[locale].toastLabels}>
          <ImpersonationBanner />
          <SiteHeader />
          {children}
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
