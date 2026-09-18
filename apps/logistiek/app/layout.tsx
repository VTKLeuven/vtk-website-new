import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
  return { title: copy[locale].appTitle, description: copy[locale].appDescription };
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
        <ImpersonationBanner />
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
