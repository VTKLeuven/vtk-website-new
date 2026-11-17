import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { ModuleAdminShell } from "@/components/admin/ModuleAdminShell";

/**
 * De pagina's (`pages.edit`/`pages.editAll`): de inhoud, bijlagen en het formulier
 * per pagina. Een eigen module naast Header; zie de uitleg in header/layout.tsx.
 */
export default async function AdminPagesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const title = nl ? "Pagina's" : "Pages";
  return (
    <ModuleAdminShell title={title} navLabel={title} tabs={[]}>
      {children}
    </ModuleAdminShell>
  );
}
