import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy, getLocale } from "@/lib/i18n";
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
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-vtk-paper text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        {analytics && (
          <Script
            strategy="afterInteractive"
            src={analytics.src}
            data-website-id={analytics.websiteId}
            data-exclude-search="true"
            data-exclude-hash="true"
          />
        )}
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
