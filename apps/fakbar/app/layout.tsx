import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const inter = Inter({ subsets: ['latin'], variable: '--font-vtk-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: "'t ElixIr", template: "%s · 't ElixIr" },
  description: "De gezelligste fakbar van Leuven. Drankkaart, foto's, verhuur en meer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="flex min-h-full flex-col bg-[--paper] text-[--ink] antialiased">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
