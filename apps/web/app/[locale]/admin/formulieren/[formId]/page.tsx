import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import {
  CalendarDays,
  Copy,
  DoorClosed,
  DoorOpen,
  Inbox,
  Link2,
  ListChecks,
  Pencil,
  Radio,
  Timer,
  Users,
  UsersRound,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { deleteFormAction, duplicateFormAction } from "@/app/actions/forms";
import { SharePanel } from "@/components/forms/admin/SharePanel";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { FormStatusSelect } from "@/components/forms/admin/FormStatusSelect";
import { missingTranslations } from "@/lib/forms/translation";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import {
  audienceLabel,
  formatDateTime,
  formatNumber,
  formBase,
  type AdminLocale,
} from "@/components/forms/admin/format";

export default async function FormAdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { form, capabilities } = await requireFormCapability(formId, "VIEW_FORM");
  const nl = locale === "nl";
  const base = formBase(locale);
  const canManage = capabilities.includes("MANAGE_FORM");

  const publicBase = (
    process.env.TICKETING_PUBLIC_URL?.trim() ||
    process.env.VTK_MAIN_URL?.trim() ||
    "https://vtk.be"
  ).replace(/\/$/, "");

  // Verkorte links draaien op hun eigen host (on.vtk.be), niet op een pad van
  // de hoofdsite; zie isShortlinkHost in proxy.ts.
  const shortLinkBase = `https://${
    process.env.SHORTLINK_HOST?.split(",")[0]?.trim() ||
    `on.${new URL(publicBase).hostname.split(".").slice(-2).join(".")}`
  }`;

  const [fieldCount, submitted, drafts, fields, sections, shortLink] =
    await Promise.all([
      prisma.formField.count({ where: { formId, archivedAt: null } }),
      prisma.formEntry.count({ where: { formId, status: "SUBMITTED", isTest: false } }),
      prisma.formEntry.count({ where: { formId, status: "DRAFT" } }),
      prisma.formField.findMany({
        where: { formId },
        include: { options: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.formSection.findMany({ where: { formId }, orderBy: { sortOrder: "asc" } }),
      prisma.shortLink.findFirst({
        where: { url: `${publicBase}/formulieren/${form.slug}` },
        select: { slug: true },
      }),
    ]);

  // Half vertaald publiceren mag, maar niet zonder het te weten: de bezoeker
  // krijgt anders een Engelse pagina met Nederlandse vragen ertussen.
  const gaps = missingTranslations(form, fields, sections);

  return (
    <div className="ticket-admin-page">
      {/* Cijfers en kenmerken staan bewust in één raster: het zijn allemaal
          antwoorden op "hoe staat dit formulier ervoor?", en gesplitst in twee
          blokken moest je twee keer kijken. */}
      <dl className="form-admin-facts">
        <div data-metric="true">
          <dt>
            <Inbox aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Inzendingen" : "Entries"}
          </dt>
          <dd>
            {form.maxEntries
              ? `${formatNumber(submitted, locale)} / ${formatNumber(form.maxEntries, locale)}`
              : formatNumber(submitted, locale)}
          </dd>
        </div>
        <div data-metric="true" data-tone={fieldCount === 0 ? "warning" : undefined}>
          <dt>
            <ListChecks aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Velden" : "Fields"}
          </dt>
          <dd>{formatNumber(fieldCount, locale)}</dd>
        </div>
        <div data-metric="true">
          <dt>
            <Pencil aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Concepten" : "Drafts"}
          </dt>
          <dd>{formatNumber(drafts, locale)}</dd>
        </div>
        <div>
          <dt>
            <Radio aria-hidden="true" size={15} strokeWidth={1.8} />
            Status
          </dt>
          <dd>
            {canManage ? (
              <FormStatusSelect
                formId={formId}
                status={form.status}
                locale={locale}
                formTitle={form.titleNl}
              />
            ) : (
              <FormStatusBadge status={form.status} locale={locale} />
            )}
          </dd>
        </div>
        <div data-wide="true">
          <dt>
            <Link2 aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Publieke link" : "Public link"}
          </dt>
          <dd>
            <Link href={`${base}/formulieren/${form.slug}`}>/formulieren/{form.slug}</Link>
          </dd>
        </div>
        <div>
          <dt>
            <Users aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Doelpubliek" : "Audience"}
          </dt>
          <dd>{audienceLabel(form.audience, locale)}</dd>
        </div>
        <div>
          <dt>
            <UsersRound aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Eigenaar" : "Owner"}
          </dt>
          <dd>{locale === "en" ? form.ownerGroup.nameEn : form.ownerGroup.nameNl}</dd>
        </div>
        {/* Opent en sluit horen samen gelezen te worden, dus staan ze in één cel:
            zo blijven ze naast elkaar, hoe het raster ook kantelt. */}
        <div className="form-admin-fact-pair" data-wide="true">
          <dt>
            <DoorOpen aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Opent" : "Opens"}
          </dt>
          <dd>{formatDateTime(form.opensAt, locale)}</dd>
          <dt>
            <DoorClosed aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Sluit" : "Closes"}
          </dt>
          <dd>{formatDateTime(form.closesAt, locale)}</dd>
        </div>
        <div>
          <dt>
            <Timer aria-hidden="true" size={15} strokeWidth={1.8} />
            {nl ? "Bewaartermijn" : "Retention"}
          </dt>
          <dd>
            {form.retentionDays
              ? nl
                ? `${form.retentionDays} dagen`
                : `${form.retentionDays} days`
              : nl
                ? "Niet automatisch verwijderen"
                : "No automatic deletion"}
          </dd>
        </div>
        {form.calendarEvent ? (
          <div>
            <dt>
              <CalendarDays aria-hidden="true" size={15} strokeWidth={1.8} />
              {nl ? "Evenement" : "Event"}
            </dt>
            <dd>
              {locale === "en" && form.calendarEvent.titleEn
                ? form.calendarEvent.titleEn
                : form.calendarEvent.titleNl}
            </dd>
          </div>
        ) : null}
      </dl>

      {gaps.length > 0 ? (
        <section className="ticket-admin-section ticket-admin-section-compact">
          <p className="ticket-admin-row-title">
            {nl
              ? `Dit formulier staat op Nederlands en Engels, maar ${gaps.length} ${gaps.length === 1 ? "onderdeel is" : "onderdelen zijn"} nog niet vertaald.`
              : `This form offers Dutch and English, but ${gaps.length} ${gaps.length === 1 ? "item is" : "items are"} not translated yet.`}
          </p>
          <ul className="form-admin-gaps">
            {gaps.slice(0, 12).map((gap) => (
              <li key={`${gap.where}-${gap.what}`}>{gap.what}</li>
            ))}
            {gaps.length > 12 ? (
              <li>{nl ? `en nog ${gaps.length - 12} andere` : `and ${gaps.length - 12} more`}</li>
            ) : null}
          </ul>
          <p className="form-admin-hint">
            {nl
              ? "Vul ze aan, of zet het formulier bij Instellingen op één taal; dan krijgt de andere taal een eigen bericht."
              : "Fill them in, or set the form to one language under Settings; the other language then gets its own message."}
          </p>
        </section>
      ) : null}

      {fieldCount === 0 ? (
        <section className="ticket-admin-section ticket-admin-section-compact">
          <p className="form-admin-hint">
            {nl
              ? "Dit formulier heeft nog geen velden, dus je kan het nog niet online zetten."
              : "This form has no fields yet, so it cannot go online."}
          </p>
          <Link
            className="ticket-admin-button"
            data-variant="primary"
            href={`${base}/admin/formulieren/${formId}/velden`}
          >
            <ListChecks aria-hidden="true" size={16} />
            {nl ? "Velden toevoegen" : "Add fields"}
          </Link>
        </section>
      ) : null}

      {canManage ? (
        <SharePanel
          locale={locale}
          formId={formId}
          formUrl={`${publicBase}/formulieren/${form.slug}`}
          shortLink={shortLink ? `${shortLinkBase}/${shortLink.slug}` : null}
        />
      ) : null}

      {canManage ? (
        <section className="ticket-admin-section" aria-labelledby="form-actions-heading">
          <div className="ticket-admin-section-head">
            <div>
              <h2 id="form-actions-heading">{nl ? "Beheer" : "Management"}</h2>
              <p>
                {nl
                  ? "Een kopie neemt de velden, secties en instellingen over, maar geen inzendingen."
                  : "A copy takes over the fields, sections and settings, but no entries."}
              </p>
            </div>
          </div>
          <div className="ticket-admin-row-actions">
            <form action={duplicateFormAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="formId" value={formId} />
              <button className="ticket-admin-button" type="submit">
                <Copy aria-hidden="true" size={15} />
                {nl ? "Form dupliceren" : "Duplicate form"}
              </button>
            </form>
            <DeleteButton
              action={deleteFormAction}
              fields={{ locale, formId }}
              title={nl ? "Form verwijderen?" : "Delete this form?"}
              description={
                submitted + drafts > 0
                  ? nl
                    ? `Dit verwijdert het formulier, zijn velden en ${submitted + drafts} inzending(en) met hun bestanden. Dat kan niet ongedaan gemaakt worden; exporteer de inzendingen eerst als je ze nog nodig hebt.`
                    : `This deletes the form, its fields and ${submitted + drafts} entr(ies) with their files. This cannot be undone; export the entries first if you still need them.`
                  : nl
                    ? "Dit verwijdert het formulier en zijn velden. Er zijn nog geen inzendingen, dus er gaan geen antwoorden verloren."
                    : "This deletes the form and its fields. There are no entries yet, so no answers are lost."
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
            >
              {nl ? "Form verwijderen" : "Delete form"}
            </DeleteButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
