import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { Markdown } from "@/components/ui/Markdown";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { cancelPianoReservationAction } from "@/app/actions/piano";
import { brusselsWallClockMinutes, brusselsYMD, isoWeekday, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { generatePianoDays, isPianoSlotBookable, pianoHorizonEnd } from "@/lib/piano";
import { getPianoConfig, getPianoInfo, getPianoRules } from "@/lib/piano-server";
import { PianoAgenda, type AgendaDay } from "./PianoAgenda";

import "@/app/design/vtk-basic.css";
import "@/app/design/vtk-piano.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("piano", "/piano", locale);
}

/**
 * Publieke pianopagina: de praktische afspraken en de weekagenda met tijdsloten.
 *
 * De uren zijn zichtbaar zonder account (zoals op de oude site); enkel het
 * effectief reserveren vraagt een aanmelding. De week staat in de URL (`?week=`)
 * in plaats van in clientstate, zodat het bladeren gewoon serverside gebeurt en
 * een link naar een bepaalde week deelbaar is.
 */
export default async function PianoPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const t = getDictionary(locale).piano;

  const session = await getCurrentSession();
  const now = new Date();
  const [config, info, rules] = await Promise.all([
    getPianoConfig(),
    getPianoInfo(),
    getPianoRules(),
  ]);

  // De getoonde week: maandag t.e.m. zondag, nooit vroeger dan de lopende week.
  const today = brusselsYMD(now);
  const currentMonday = shiftYMD(today, 1 - isoWeekday(today));
  const requested = parseYMD((await searchParams).week ?? "") ?? currentMonday;
  const requestedMonday = shiftYMD(requested, 1 - isoWeekday(requested));
  const monday = ymdKey(requestedMonday) < ymdKey(currentMonday) ? currentMonday : requestedMonday;
  const sunday = shiftYMD(monday, 6);

  const horizonEnd = pianoHorizonEnd(now, config);
  const allDays = generatePianoDays(rules.windows, rules.closures, {
    from: monday,
    to: sunday,
    slotMinutes: config.slotMinutes,
  });
  // Een dag waarvan het laatste slot al voorbij is, hoeft niet meer op het scherm:
  // in de lopende week zou de helft anders uitgegrijsd staan.
  const days = allDays.filter((d) => d.slots.some((s) => s.endsAt > now));

  const slotStarts = days.flatMap((d) => d.slots.map((s) => s.startsAt));
  const reservations = slotStarts.length
    ? await prisma.pianoReservation.findMany({
        where: { startsAt: { in: slotStarts } },
        select: { startsAt: true, userId: true },
      })
    : [];
  const takenBy = new Map(reservations.map((r) => [r.startsAt.getTime(), r.userId]));

  const mine = session
    ? await prisma.pianoReservation.findMany({
        where: { userId: session.user.id, endsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
      })
    : [];

  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const shortFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  const agendaDays: AgendaDay[] = days.map((day) => ({
    date: day.date,
    label: dayFmt.format(day.slots[0].startsAt),
    slots: day.slots.map((slot) => {
      const owner = takenBy.get(slot.startsAt.getTime());
      return {
        startsAt: slot.startsAt.toISOString(),
        label: `${timeFmt.format(slot.startsAt)} - ${timeFmt.format(slot.endsAt)}`,
        state:
          slot.endsAt <= now
            ? ("past" as const)
            : owner && session && owner === session.user.id
              ? ("mine" as const)
              : owner
                ? ("taken" as const)
                : isPianoSlotBookable(slot.startsAt, now, config)
                  ? ("free" as const)
                  : ("past" as const),
      };
    }),
  }));

  const weekHref = (target: { year: number; month: number; day: number }) =>
    `${base}/piano?week=${ymdKey(target)}`;
  const showPrev = ymdKey(monday) > ymdKey(currentMonday);
  const showNext = ymdKey(shiftYMD(monday, 7)) <= ymdKey(horizonEnd);

  return (
    <div className="vtk-page vtk-basic">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-piano-layout">
          <div className="vtk-piano-intro">
            <section className="vtk-basic-panel">
              <div className="prose-vtk">
                <Markdown>{pick(info.bodyNl, info.bodyEn, locale)}</Markdown>
              </div>
            </section>

            <aside className="vtk-basic-panel vtk-basic-panel-muted">
              <h2 className="vtk-basic-table-title">{t.practical}</h2>
              <dl className="vtk-piano-facts">
                <div>
                  <dt>{t.facts.location}</dt>
                  <dd>{t.facts.locationValue}</dd>
                </div>
                <div>
                  <dt>{t.facts.price}</dt>
                  <dd>{t.facts.priceValue}</dd>
                </div>
                <div>
                  <dt>{t.facts.limit}</dt>
                  <dd>
                    {config.maxPerWeek === 1
                      ? t.facts.limitOne
                      : t.facts.limitMany.replace("{count}", String(config.maxPerWeek))}
                    <br />
                    {t.facts.horizon.replace("{days}", String(config.horizonDays))}
                  </dd>
                </div>
                <div>
                  <dt>{t.facts.letter}</dt>
                  <dd>{t.facts.letterValue}</dd>
                </div>
              </dl>
            </aside>
          </div>

          {session ? (
            <section className="vtk-basic-panel">
              <h2 className="vtk-basic-table-title">{t.mine.title}</h2>
              {mine.length === 0 ? (
                <p className="vtk-basic-copy">{t.mine.empty}</p>
              ) : (
                <ul className="vtk-piano-mine">
                  {mine.map((reservation) => (
                    <li key={reservation.id}>
                      <span className="vtk-piano-mine-when">
                        {dayFmt.format(reservation.startsAt)}
                        <span className="vtk-piano-mine-time">
                          {timeFmt.format(reservation.startsAt)} - {timeFmt.format(reservation.endsAt)}
                        </span>
                      </span>
                      <DeleteButton
                        action={cancelPianoReservationAction}
                        fields={{ id: reservation.id }}
                        title={t.mine.confirmTitle}
                        description={t.mine.confirmBody}
                        confirmLabel={t.mine.confirmYes}
                        cancelLabel={t.mine.confirmNo}
                        successMessage={t.mine.cancelled}
                      >
                        {t.mine.cancel}
                      </DeleteButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section className="vtk-basic-alert vtk-basic-alert-info">
              <span className="vtk-basic-alert-icon" aria-hidden>
                i
              </span>
              <div>
                <p className="vtk-basic-alert-title">{t.login.title}</p>
                <p className="vtk-basic-alert-text">{t.login.body}</p>
                <p style={{ marginTop: 12 }}>
                  {/* `vtk-button` en niet `vtk-basic-button`: die laatste verliest binnen
                      `.vtk-basic` zijn tekstkleur aan de `.vtk-basic a { color: inherit }`-regel. */}
                  <Link
                    href={`${base}/inloggen?next=${encodeURIComponent(`${base}/piano`)}`}
                    className="vtk-button vtk-button-primary"
                  >
                    {getDictionary(locale).auth.signIn}
                  </Link>
                </p>
              </div>
            </section>
          )}

          <section className="vtk-basic-panel">
            <div className="vtk-piano-weeknav">
              <div>
                <h2 className="vtk-basic-table-title">{t.agenda.title}</h2>
                <p className="vtk-piano-weeklabel">
                  {t.agenda.week
                    .replace("{from}", shortFmt.format(brusselsWallClockMinutes(monday, 12 * 60)))
                    .replace("{to}", shortFmt.format(brusselsWallClockMinutes(sunday, 12 * 60)))}
                </p>
              </div>
              <div className="vtk-piano-weeknav-buttons">
                {showPrev && (
                  <Link className="vtk-basic-badge" href={weekHref(shiftYMD(monday, -7))}>
                    {t.agenda.prev}
                  </Link>
                )}
                <Link className="vtk-basic-badge" href={weekHref(currentMonday)}>
                  {t.agenda.thisWeek}
                </Link>
                {showNext && (
                  <Link className="vtk-basic-badge" href={weekHref(shiftYMD(monday, 7))}>
                    {t.agenda.next}
                  </Link>
                )}
              </div>
            </div>

            <PianoAgenda locale={locale} days={agendaDays} canReserve={Boolean(session)} />
          </section>
        </div>
      </div>
    </div>
  );
}
