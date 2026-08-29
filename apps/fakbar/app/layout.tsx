import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-vtk-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: "'t ElixIr · de fakbar van VTK Leuven", template: "%s · 't ElixIr" },
  description: "De faculteitsbar van Ingenieurswetenschappen in Leuven: openingsuren, drankkaart en verhuur.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="vtk-fakbar-dark flex min-h-full flex-col bg-[var(--paper)] text-[var(--ink)] antialiased">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
