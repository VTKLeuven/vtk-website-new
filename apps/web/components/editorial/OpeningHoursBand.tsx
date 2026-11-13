import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { OUTBOUND_EVENT, umamiEvent } from "@/lib/analytics";
import type { HoursLayout } from "@/lib/home/hoursLayout";
import type { HoursBand, HoursBandService, HoursCell, TimelineBar } from "@/lib/openingHoursWeek";

import "@/app/design/vtk-hours.css";

/**
 * De openingsurenband op de homepage, in een van twee weergaven die in
 * /admin/home gekozen worden (`lib/home/hoursLayout.ts`):
 *
 * - **Week in strepen** (`strips`, de standaard): per dienst een kolom met de
 *   week als dunne rijen op dezelfde tijdas; vandaag is de dikste rij en draagt
 *   de nu-lijn.
 * - **Zonder kader** (`plain`): per dienst een rij op de band, vandaag als dunne
 *   lijn met de vensters erop, de week als tekst eronder, en één nu-lijn door
 *   alle diensten.
 *
 * Beide vervangen een glazen paneel met gele kapitalen, statusbolletjes en
 * balken als pillen, dat als een sjabloon las. Alles is vooraf uitgerekend in
 * `buildHoursBand`; hier staat enkel de opmaak, en er gaat geen JavaScript mee
 * naar de browser. Zie docs/design-decisions.md.
 */

/**
 * Lichte versies van de logo's voor de navy band, op dubbele grootte. Het
 * Theokot houdt zijn rood. Van de cursusdienst staat enkel het hoofd van de kat
 * erin: de hele tekening wordt op deze grootte een vlek.
 */
const LOGOS: Record<string, { src: string; width: number; height: number }> = {
  theokot: { src: "/openingsuren/theokot.png", width: 63, height: 38 },
  cursusdienst: { src: "/openingsuren/cursusdienst.png", width: 64, height: 46 },
  elixir: { src: "/openingsuren/elixir.png", width: 62, height: 36 },
};

const CUDI_SLOTS_URL = "https://cudi.vtk.be/vtk/account/slots";

/** Zo dicht bij "nu" (in procent van de as) wijkt een uur op de as voor het nu-label. */
const NOW_CLEARANCE = 4.5;

function position(left: number, width?: number): CSSProperties {
  return {
    "--l": `${left.toFixed(3)}%`,
    ...(width === undefined ? {} : { "--w": `${width.toFixed(3)}%` }),
  } as CSSProperties;
}

/** Het begin van een venster: "12:35" uit "12:35–13:50", "22:00" uit "vanaf 22:00". */
function startOf(label: string): string {
  return label.match(/\d{2}:\d{2}/)?.[0] ?? label;
}

function ServiceAction({ service, base, nl }: { service: HoursBandService; base: string; nl: boolean }) {
  if (service.key === "theokot") {
    return (
      <Link className="hours-cta" href={`${base}/theokot`}>
        {nl ? "Bestel een broodje" : "Order a sandwich"} <span aria-hidden>→</span>
      </Link>
    );
  }
  if (service.key === "cursusdienst") {
    return (
      <>
        <a
          className="hours-cta"
          href={CUDI_SLOTS_URL}
          target="_blank"
          rel="noopener noreferrer"
          {...umamiEvent(OUTBOUND_EVENT, { bestemming: "cudi.vtk.be", vanaf: "openingsuren" })}
        >
          {nl ? "Boek een tijdslot" : "Book a time slot"} <span aria-hidden>↗</span>
        </a>
        <p className="hours-hint">
          {nl ? "Zonder tijdslot kan je je boeken niet ophalen." : "Without a time slot you cannot pick up your books."}
        </p>
      </>
    );
  }
  return null;
}

/** De statuszin, met het uur erin als het enige dat oplicht: "Opent vandaag om **10:30**". */
function StatusText({ label }: { label: string }) {
  const match = label.match(/^(.*?)(\d{2}:\d{2})$/);
  if (!match) return <>{label}</>;
  return (
    <>
      {match[1]}
      <em>{match[2]}</em>
    </>
  );
}

/** Logo, naam en status: in beide weergaven dezelfde kop van een dienst. */
function ServiceHead({ service }: { service: HoursBandService }) {
  const logo = LOGOS[service.key];
  return (
    <>
      <div className="hours-head">
        {logo ? (
          <Image
            className="hours-logo"
            src={logo.src}
            width={logo.width}
            height={logo.height}
            alt=""
            style={{ "--logo-h": `${logo.height}px` } as CSSProperties}
          />
        ) : null}
        <div className="hours-head-name">
          <h3 id={`hours-${service.key}`} className="hours-name">
            {service.name}
          </h3>
          {service.subtitle ? <p className="hours-sub">{service.subtitle}</p> : null}
        </div>
      </div>
      <p className="hours-status" data-state={service.status.state}>
        <StatusText label={service.status.label} />
      </p>
      {service.status.extra ? <p className="hours-hint">{service.status.extra}</p> : null}
    </>
  );
}

/** De week als tekst voor een schermlezer, wanneer ze enkel als grafiek te zien is. */
function WeekForScreenReader({ cells, nl }: { cells: HoursCell[]; nl: boolean }) {
  return (
    <ul className="sr-only">
      {cells.map((cell) => (
        <li key={cell.day}>
          {cell.full}
          {cell.today ? (nl ? " (vandaag)" : " (today)") : ""}:{" "}
          {cell.lines.length > 0 ? cell.lines.join(", ") : nl ? "gesloten" : "closed"}
        </li>
      ))}
    </ul>
  );
}

function weekLabel(band: HoursBand, nl: boolean): string {
  return band.nextWeek ? (nl ? "volgende week" : "next week") : nl ? "deze week" : "this week";
}

/** "Vandaag, vrijdag" of "Woensdagnacht", met de dag in het vet. */
function DayText({ band, nl }: { band: HoursBand; nl: boolean }) {
  if (band.overnight) {
    const name = band.dayLabel.charAt(0).toUpperCase() + band.dayLabel.slice(1);
    return <b>{name}</b>;
  }
  return (
    <>
      {nl ? "Vandaag" : "Today"}, <b>{band.dayName}</b>
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* Zonder kader                                                              */
/* ------------------------------------------------------------------------- */

function PlainBar({ bar }: { bar: TimelineBar }) {
  return (
    <>
      <span
        className="hours-plain-bar"
        data-kind={bar.kind}
        data-active={bar.active || undefined}
        data-tail={bar.tail}
        style={position(bar.left, bar.width)}
      />
      {bar.label ? (
        <span
          className="hours-plain-label"
          data-active={bar.active || undefined}
          data-crowded={bar.crowded || undefined}
          style={position(bar.left)}
        >
          <span className="hours-full">{bar.label}</span>
          <span className="hours-short">{startOf(bar.label)}</span>
        </span>
      ) : null}
    </>
  );
}

function PlainLayout({ band, base, nl }: { band: HoursBand; base: string; nl: boolean }) {
  const now = band.now;
  const ticks = band.ticks.filter((tick) => !now || Math.abs(tick.left - now.left) > NOW_CLEARANCE);
  return (
    <div
      className="hours-plain"
      style={
        {
          "--hours-span": band.hours,
          "--hours-cols": band.columns,
          ...(now ? { "--now": (now.left / 100).toFixed(4) } : {}),
        } as CSSProperties
      }
    >
      <div className="hours-plain-axis" aria-hidden>
        <p className="hours-plain-day">
          <DayText band={band} nl={nl} />
        </p>
        <div className="hours-plain-ticks">
          {ticks.map((tick) => (
            <span key={tick.label} className="hours-plain-tick" style={position(tick.left)}>
              {tick.label}
            </span>
          ))}
          {now ? (
            <span className="hours-plain-nowlabel" style={position(now.left)}>
              {now.label}
            </span>
          ) : null}
        </div>
      </div>
      {now ? <span className="hours-plain-nowline" aria-hidden /> : null}

      {band.services.map((service) => (
        <article key={service.key} className="hours-plain-row" aria-labelledby={`hours-${service.key}`}>
          <div className="hours-plain-id">
            <ServiceHead service={service} />
            {service.note ? <p className="hours-hint">{service.note}</p> : null}
            <ServiceAction service={service} base={base} nl={nl} />
          </div>

          <div className="hours-plain-days">
            <p className="hours-plain-mday" aria-hidden>
              <DayText band={band} nl={nl} />
              {now ? (
                <>
                  , <b>{now.label}</b>
                </>
              ) : null}
            </p>
            <div className="hours-plain-track" aria-hidden>
              {service.unavailable ? (
                <span className="hours-plain-empty">{service.status.label}</span>
              ) : service.bars.length === 0 ? (
                <span className="hours-plain-empty">{nl ? "Vandaag dicht" : "Closed today"}</span>
              ) : (
                service.bars.map((bar, index) => <PlainBar key={index} bar={bar} />)
              )}
              {now ? <span className="hours-plain-mnow" style={position(now.left)} /> : null}
            </div>
            <div className="hours-plain-mticks" aria-hidden>
              {band.ticks
                .filter((tick) => !tick.minor)
                .map((tick) => (
                  <span key={tick.label} style={position(tick.left)}>
                    {tick.label.slice(0, 2)}
                  </span>
                ))}
            </div>

            {service.cells.length > 0 ? (
              <ul className="hours-plain-week" aria-label={weekLabel(band, nl)}>
                {service.cells.map((cell) => (
                  <li key={cell.day} className="hours-plain-cell" data-today={cell.today || undefined}>
                    <span className="hours-plain-cell-day">
                      <span aria-hidden>{cell.short.toLowerCase()}</span>
                      <span className="sr-only">
                        {cell.full}
                        {cell.today ? (nl ? " (vandaag)" : " (today)") : ""}
                      </span>
                    </span>
                    {cell.lines.length > 0 ? (
                      cell.lines.map((line) => (
                        <span key={line} className="hours-plain-time">
                          {line}
                        </span>
                      ))
                    ) : (
                      <span className="hours-plain-time" data-closed>
                        {nl ? "dicht" : "closed"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Week in strepen                                                           */
/* ------------------------------------------------------------------------- */

function StripBar({ bar }: { bar: TimelineBar }) {
  return (
    <span
      className="hours-strips-bar"
      data-kind={bar.kind}
      data-side={bar.side}
      data-active={bar.active || undefined}
      data-tail={bar.tail}
      data-crowded={bar.crowded || undefined}
      style={position(bar.left, bar.width)}
    >
      {bar.label ? (
        <>
          {/* In de balk wanneer hij breed genoeg is, anders ernaast (container query). */}
          <span className="hours-strips-in">{bar.label}</span>
          <span className="hours-strips-tag">
            <span className="hours-full">{bar.label}</span>
            <span className="hours-short">{startOf(bar.label)}</span>
          </span>
        </>
      ) : null}
    </span>
  );
}

function StripsLayout({ band, base, nl }: { band: HoursBand; base: string; nl: boolean }) {
  const now = band.now;
  // Om de vier uur een uur op de as, en niet vlak naast het uur van nu.
  const ticks = band.ticks.filter(
    (tick, index) => index % 2 === 0 && (!now || Math.abs(tick.left - now.left) > NOW_CLEARANCE * 2),
  );
  return (
    <div className="hours-strips" style={{ "--hours-span": band.hours } as CSSProperties}>
      {band.services.map((service) => (
        <article key={service.key} className="hours-strips-svc" aria-labelledby={`hours-${service.key}`}>
          <ServiceHead service={service} />

          {service.unavailable ? null : (
            <>
              <div className="hours-strips-chart" aria-hidden>
                {service.rows.map((row) => (
                  <div key={row.day} className="hours-strips-line" data-today={row.today || undefined}>
                    <span className="hours-strips-day">{row.short.toLowerCase()}</span>
                    <div className="hours-strips-lane">
                      {row.bars.length === 0 ? (
                        <span className="hours-strips-closed">{nl ? "dicht" : "closed"}</span>
                      ) : (
                        row.bars.map((bar, index) => <StripBar key={index} bar={bar} />)
                      )}
                      {row.today && now ? <span className="hours-strips-now" style={position(now.left)} /> : null}
                    </div>
                  </div>
                ))}
                <div className="hours-strips-axis">
                  <span />
                  <div>
                    {ticks.map((tick) => (
                      <span key={tick.label} style={position(tick.left)}>
                        {tick.label}
                      </span>
                    ))}
                    {now ? (
                      <span className="hours-strips-nowlabel" style={position(now.left)}>
                        {now.label}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <WeekForScreenReader cells={service.cells} nl={nl} />
            </>
          )}

          {service.note ? <p className="hours-hint">{service.note}</p> : null}
          <div className="hours-strips-actions">
            <ServiceAction service={service} base={base} nl={nl} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function OpeningHoursBand({
  band,
  meta,
  locale,
  base,
  layout,
}: {
  band: HoursBand;
  meta: string;
  locale: Locale;
  base: string;
  /** Gekozen in /admin/home. */
  layout: HoursLayout;
}) {
  const nl = locale === "nl";
  let body: ReactNode;
  if (layout === "plain") body = <PlainLayout band={band} base={base} nl={nl} />;
  else body = <StripsLayout band={band} base={base} nl={nl} />;

  return (
    <section className="hours-strip" data-layout={layout} aria-labelledby="hours-title">
      <div className="sec-head">
        <h2 id="hours-title">{nl ? "Openingsuren." : "Opening hours."}</h2>
        <div className="meta">
          {meta} ·{" "}
          <span className="hours-week-label" data-next={band.nextWeek || undefined}>
            {weekLabel(band, nl)}
          </span>
        </div>
      </div>
      {body}
    </section>
  );
}
