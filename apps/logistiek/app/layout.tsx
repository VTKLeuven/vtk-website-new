import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { copy, getLocale } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({ variable: "--font-vtk-sans", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: copy[locale].appTitle, description: copy[locale].appDescription };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-vtk-paper text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
