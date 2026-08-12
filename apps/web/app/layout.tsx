import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import Script from "next/script";
import { cookies, headers } from "next/headers";
import { getSentryDsn } from "@/lib/runtimeConfig";
import { CookieConsent } from "@/components/site/CookieConsent";
import { HTML_LANG, currentLocale } from "@/lib/locale";
import { analyticsConfigFromEnv, analyticsScript } from "@/lib/analytics";
import { COOKIE_CONSENT_NAME, parseCookieConsent } from "@/lib/cookie-consent";
import {
  SITE_DESCRIPTION,
  SITE_LONG_NAME,
  SITE_TITLE_TEMPLATE,
  siteMetadataBase,
} from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vtkSans = Inter({
  variable: "--font-vtk-sans",
  subsets: ["latin"],
});
const vtkSerif = Instrument_Serif({
  variable: "--font-vtk-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Basis voor elke relatieve URL in metadata. `lib/seo.ts` levert absolute
  // URL's, maar de bestandsconventies (opengraph-image) hebben dit wel nodig.
  metadataBase: siteMetadataBase(),
  // Een pagina zet enkel haar eigen titel; het sjabloon plakt de sitenaam eraan.
  // Ook onder `openGraph`, want Next houdt dat sjabloon apart bij en past het
  // toe op de `og:title` van een dieper segment.
  title: { default: SITE_LONG_NAME, template: SITE_TITLE_TEMPLATE },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    title: { default: SITE_LONG_NAME, template: SITE_TITLE_TEMPLATE },
    description: SITE_DESCRIPTION,
    siteName: "VTK",
  },
  twitter: {
    card: "summary_large_image",
    title: { default: SITE_LONG_NAME, template: SITE_TITLE_TEMPLATE },
  },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // De Sentry-client-DSN komt uit de DB-config (Admin -> IT). We spuiten ze in
  // het document zodat instrumentation-client.ts ze kan lezen; dat script draait
  // na het laden van het document. De client-DSN is publiek per ontwerp.
  const sentryDsn = await getSentryDsn();

  // Deze layout staat boven `[locale]` en krijgt dus geen params. De taal komt
  // uit de `x-pathname`-header die `proxy.ts` zet: die draagt altijd het
  // taalvoorvoegsel, ook wanneer de bezoeker op de voorvoegselloze NL-URL zit.
  const locale = await currentLocale();

  // Bezoekersstatistieken (Umami, op onze eigen server). Het script staat er
  // enkel na een expliciete keuze in de cookiebanner en nooit op de beheer- of
  // bestelschermen; `lib/analytics.ts` neemt die beslissing. Het pad komt uit
  // dezelfde `x-pathname`-header als de taal hierboven.
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const analytics = analyticsScript({
    config: analyticsConfigFromEnv(),
    consent: parseCookieConsent(cookieStore.get(COOKIE_CONSENT_NAME)?.value),
    pathname: requestHeaders.get("x-pathname") ?? "",
  });

  return (
    <html
      lang={HTML_LANG[locale]}
      className={`${geistSans.variable} ${geistMono.variable} ${vtkSans.variable} ${vtkSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-vtk-surface text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        {sentryDsn && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__SENTRY_DSN__=${JSON.stringify(sentryDsn)}`,
            }}
          />
        )}
        {analytics && (
          <>
            {/* Definieert de filterfunctie voor het tracker-script laadt. */}
            <script dangerouslySetInnerHTML={{ __html: analytics.filterSource }} />
            <Script
              strategy="afterInteractive"
              src={analytics.src}
              data-website-id={analytics.websiteId}
              data-before-send={analytics.beforeSend}
              data-exclude-search="true"
              data-exclude-hash="true"
            />
          </>
        )}
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
