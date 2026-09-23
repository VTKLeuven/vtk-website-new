import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { listTicketEventTemplates } from "@/lib/ticketing/templateStore";
import { TicketTemplateManager } from "./TicketTemplateManager";
import { ticketBase, type AdminLocale } from "@/components/ticketing/admin/format";

/**
 * Het beheer van de ticketsjablonen: een eigen pagina en geen tab op het
 * aanmaakscherm. Wie een event aanmaakt, kiest een sjabloon; wie de sjablonen
 * zelf schrijft, doet iets anders, met een eigen recht en een ander ritme.
 */
export default async function TicketTemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  await requirePermission("tickets.templates");

  const [templates, groups] = await Promise.all([
    listTicketEventTemplates(),
    prisma.group.findMany({
      where: { active: true },
      orderBy: { orderInPraesidium: "asc" },
      select: { id: true, nameNl: true, nameEn: true },
    }),
  ]);

  const base = ticketBase(locale);

  return (
    <>
      <Link className="ticket-admin-back" href={`${base}/admin/tickets`}>
        <ArrowLeft aria-hidden="true" size={14} />
        {locale === "nl" ? "Ticketbeheer" : "Ticket management"}
      </Link>
      <TicketTemplateManager templates={templates} groups={groups} locale={locale} />
    </>
  );
}
