import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { GrocomeetAdminNav } from "./GrocomeetAdminNav";

import "@/app/design/vtk-basic.css";

/**
 * Beheer van de grocomeets (`grocomeet.manage`: admin en de verantwoordelijke
 * van Theokot), in vier tabbladen: de vergaderingen zelf (kalender en
 * bestellingen), wie nog wat verschuldigd is, het overzicht voor de
 * herbegroting, en de drankjes. Dit was één lange pagina; het bureau van
 * Onderwijs draait op dezelfde code onder /admin/bureau.
 */
export default async function AdminGrocomeetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("grocomeet.manage");
  const nl = locale === "nl";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Grocomeet · {formatWorkingYear(currentWorkingYear())}</h1>
      <GrocomeetAdminNav nl={nl} />
      {children}
    </div>
  );
}
