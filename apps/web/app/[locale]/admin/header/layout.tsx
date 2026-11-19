import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ModuleAdminShell } from "@/components/admin/ModuleAdminShell";

/**
 * De header: welke categorieën en menu-items bovenaan de site staan (`pages.manage`).
 * Was één module met Pagina's, met elk een tabblad; maar het zijn twee aparte
 * items in de zijbalk met elk hun eigen recht, en twee tabbladen onder een kop
 * "Header & pagina's" lazen als één scherm dat er twee keer stond.
 */
export default async function AdminHeaderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const title = "Header";
  return (
    <ModuleAdminShell title={title} navLabel={title} tabs={[]}>
      {children}
    </ModuleAdminShell>
  );
}
