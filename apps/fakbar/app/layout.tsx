import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ToastProvider } from '@/components/ui/toast';

const inter = Inter({ subsets: ['latin'], variable: '--font-vtk-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: "'t ElixIr · de fakbar van VTK Leuven", template: "%s · 't ElixIr" },
  description: "De faculteitsbar van Ingenieurswetenschappen in Leuven: openingsuren, drankkaart en verhuur.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={inter.variable}>
      <body className="vtk-fakbar-dark flex min-h-full flex-col bg-[var(--paper)] text-[var(--ink)] antialiased">
        {/*
          De toasts staan hier en niet enkel in de admin-layout. `useToast()`
          gooit zonder provider, en sinds de publieke fotopagina een formulier
          heeft (een foto laten verwijderen) crashte die pagina daarop: de knop
          deed niets. De hoofdsite zet de provider om dezelfde reden in haar
          locale-layout, dus boven alles.
        */}
        <ToastProvider>
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </ToastProvider>
      </body>
    </html>
  );
}
