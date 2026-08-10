import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { ArrowLeft, ClipboardPlus } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { canSessionCreateFormForGroup } from "@/lib/forms/authorization";
import { FormCreateForm } from "@/components/forms/admin/FormCreateForm";
import { formBase, formatDate, type AdminLocale } from "@/components/forms/admin/format";

export default async function NewFormPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const session = await requireSession();
  const base = formBase(locale);

  const manageAll = hasPermission(session, "forms.manageAll");
  const groupRows = await prisma.group.findMany({
    where: manageAll
      ? { active: true }
      : { active: true, id: { in: session.groups.map((group) => group.id) } },
    select: { id: true, nameNl: true, nameEn: true },
    orderBy: { orderInPraesidium: "asc" },
  });

  const groups = groupRows
    .filter((group) => canSessionCreateFormForGroup(session, group.id))
    .map((group) => ({
      id: group.id,
      name: locale === "en" ? group.nameEn : group.nameNl,
    }));

  // Geen enkele post om voor aan te maken: dan is dit scherm een doodlopend
  // straatje, en zeggen we dat liever dan een lege keuzelijst te tonen.
  if (groups.length === 0) {
    return (
      <div className="ticket-admin-page">
        <div className="ticket-admin-page-head">
          <div>
            <h1>{locale === "nl" ? "Nieuw formulier" : "New form"}</h1>
            <p>
              {locale === "nl"
                ? "Je hebt geen post waarvoor je formulieren mag aanmaken. Vraag de verantwoordelijke van je post of IT om het recht `forms.create`."
                : "You have no post you can create forms for. Ask your post lead or IT for the `forms.create` permission."}
            </p>
          </div>
          <Link className="ticket-admin-button" href={`${base}/admin/formulieren`}>
            <ArrowLeft aria-hidden="true" size={15} />
            {locale === "nl" ? "Terug" : "Back"}
          </Link>
        </div>
      </div>
    );
  }

  // Evenementen van de eigen posten, van een maand terug tot een jaar vooruit:
  // verder terug koppelt niemand nog een formulier aan.
  const now = new Date();
  const calendarRows = await prisma.calendarEvent.findMany({
    where: {
      groupId: { in: groups.map((group) => group.id) },
      start: {
        gte: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
        lte: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      },
      form: null,
    },
    select: { id: true, titleNl: true, titleEn: true, start: true, groupId: true },
    orderBy: { start: "asc" },
    take: 200,
  });

  const calendarEvents = calendarRows.map((event) => ({
    id: event.id,
    groupId: event.groupId,
    label: `${locale === "en" && event.titleEn ? event.titleEn : event.titleNl} · ${formatDate(event.start, locale)}`,
  }));

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <Link className="ticket-admin-back" href={`${base}/admin/formulieren`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {locale === "nl" ? "Alle formulieren" : "All forms"}
          </Link>
          <h1>{locale === "nl" ? "Nieuw formulier" : "New form"}</h1>
          <p>
            {locale === "nl"
              ? "Hierna kom je meteen in de veldeditor terecht."
              : "You land in the field editor right after this."}
          </p>
        </div>
      </div>

      <section className="ticket-admin-section" aria-labelledby="new-form-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <ClipboardPlus aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="new-form-heading">{locale === "nl" ? "Het formulier" : "The form"}</h2>
            </div>
          </div>
        </div>
        <FormCreateForm locale={locale} groups={groups} calendarEvents={calendarEvents} />
      </section>
    </div>
  );
}
