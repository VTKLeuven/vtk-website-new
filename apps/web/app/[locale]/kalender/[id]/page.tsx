import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";

function formatDateRange(start: Date, end: Date, locale: Locale, allDay: boolean) {
  const dateLocale = locale === "nl" ? "nl-BE" : "en-GB";
  const day = start.toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (allDay) return `${day} · ${locale === "nl" ? "hele dag" : "all day"}`;

  const startTime = start.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${startTime} - ${endTime}`;
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: { group: true },
  });

  if (!event || event.visibility !== "PUBLIC") notFound();

  const title = pick(event.titleNl, event.titleEn, locale);
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  const groupName = pick(event.group.nameNl, event.group.nameEn, locale);

  return (
    <article className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">
            <Link href={`${base}/kalender`} className="vtk-link">
              {locale === "nl" ? "Kalender" : "Calendar"}
            </Link>{" "}
            · {groupName}
          </div>
          <h1 className="vtk-page-title">{title}</h1>
          <p className="vtk-page-subtitle">{formatDateRange(event.start, event.end, locale, event.allDay)}</p>
        </div>
        <div className="page-head-meta">
          {locale === "nl" ? "Groep" : "Group"}
          <br />
          <b>{groupName}</b>
          <br />
          <br />
          {locale === "nl" ? "Locatie" : "Location"}
          <br />
          <b>{event.location ?? (locale === "nl" ? "Nog te bevestigen" : "To be confirmed")}</b>
        </div>
      </header>

      <div className="vtk-page-shell vtk-page-narrow">
        <section className="vtk-panel p-6">
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-vtk-ink">
            {locale === "nl" ? "Over dit event" : "About this event"}
          </h2>
          <p className="leading-7 text-[#34405e]">
            {description ||
              (locale === "nl"
                ? "Meer details worden later aangevuld door de organiserende werkgroep."
                : "More details will be added later by the organising work group.")}
          </p>
          <dl className="spec mt-6">
            <dt>{locale === "nl" ? "Start" : "Start"}</dt>
            <dd>{event.start.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB")}</dd>
            <dt>{locale === "nl" ? "Einde" : "End"}</dt>
            <dd>{event.end.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB")}</dd>
            <dt>{locale === "nl" ? "Zichtbaarheid" : "Visibility"}</dt>
            <dd>{locale === "nl" ? "Publiek" : "Public"}</dd>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`${base}/kalender`} className="btn btn-ghost">
              ← {locale === "nl" ? "Terug naar kalender" : "Back to calendar"}
            </Link>
            {event.url ? (
              <a href={event.url} className="btn btn-primary arrow">
                {locale === "nl" ? "Externe eventlink" : "External event link"}
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </article>
  );
}
