import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import { getSentryDsn } from "@/lib/runtimeConfig";
import { CookieConsent } from "@/components/site/CookieConsent";
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
  title: "Vlaamse Technische Kring",
  description:
    "De officiële website van VTK, de studentenvereniging van de faculteit ingenieurswetenschappers.",
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

  return (
    <html
      lang="nl"
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
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
