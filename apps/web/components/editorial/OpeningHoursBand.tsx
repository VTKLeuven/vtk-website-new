import Image from "next/image";
import type { CSSProperties } from "react";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { OUTBOUND_EVENT, umamiEvent } from "@/lib/analytics";
import type { HoursBand, HoursBandService, TimelineBar } from "@/lib/openingHoursWeek";

/**
 * De openingsurenband op de homepage: per dienst vandaag als tijdlijn, met de
 * week als rooster eronder. Alles is vooraf uitgerekend in `buildHoursBand`;
 * hier staat enkel de opmaak, en er gaat geen JavaScript mee naar de browser.
 * Zie docs/design-decisions.md voor waarom het zo uitziet.
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

function position(left: number, width?: number): CSSProperties {
  return {
    "--l": `${left.toFixed(3)}%`,
    ...(width === undefined ? {} : { "--w": `${width.toFixed(3)}%` }),
  } as CSSProperties;
}

function Bar({ bar }: { bar: TimelineBar }) {
  return (
    <span
      className="hours-bar"
      data-kind={bar.kind}
      data-side={bar.side}
      data-active={bar.active || undefined}
      data-tail={bar.tail}
      data-crowded={bar.crowded || undefined}
      style={position(bar.left, bar.width)}
    >
      {bar.label ? (
        <>
          <span className="hours-bar-text">{bar.label}</span>
          {/* Toont de container query wanneer de balk te smal is voor zijn tekst. */}
          <span className="hours-bar-tag">{bar.label}</span>
        </>
      ) : null}
    </span>
  );
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
        <p className="hours-cta-hint">
          {nl ? "Zonder tijdslot kan je je boeken niet ophalen." : "Without a time slot you cannot pick up your books."}
        </p>
      </>
    );
  }
  return null;
}

export function OpeningHoursBand({
  band,
  meta,
  locale,
  base,
}: {
  band: HoursBand;
  meta: string;
  locale: Locale;
  base: string;
}) {
  const nl = locale === "nl";
  const weekLabel = band.nextWeek ? (nl ? "Volgende week" : "Next week") : nl ? "Deze week" : "This week";
  const nowStyle = band.now ? position(band.now.left) : undefined;
  const ticks = band.ticks.map((tick) => (
    <span key={tick.label} className="hours-tick" data-minor={tick.minor || undefined} style={position(tick.left)}>
      {tick.label}
    </span>
  ));

  return (
    <section className="hours-strip" aria-labelledby="hours-title">
      <div className="sec-head">
        <h2 id="hours-title">{nl ? "Openingsuren." : "Opening hours."}</h2>
        <div className="meta">
          {meta} · {nl ? "rooster van " : "schedule for "}
          <span className="hours-week-label" data-next={band.nextWeek || undefined}>
            {weekLabel.toLowerCase()}
          </span>
        </div>
      </div>

      <div
        className="hours-panel"
        style={{ "--hours-span": band.hours, "--hours-cols": band.columns } as CSSProperties}
      >
        <div className="hours-axis" aria-hidden>
          <div className="hours-axis-label">{band.dayLabel}</div>
          <div className="hours-axis-track">
            {ticks}
            {band.now ? (
              <span className="hours-now-tag" style={nowStyle}>
                {band.now.label}
              </span>
            ) : null}
          </div>
        </div>

        {band.services.map((service) => {
          const logo = LOGOS[service.key];
          return (
            <article key={service.key} className="hours-service" aria-labelledby={`hours-${service.key}`}>
              <div className="hours-id">
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
                <div className="hours-id-text">
                  <h3 id={`hours-${service.key}`} className="hours-name">
                    {service.name}
                  </h3>
                  {service.subtitle ? <p className="hours-sub">{service.subtitle}</p> : null}
                  <p className="hours-status" data-state={service.status.state}>
                    {service.status.label}
                  </p>
                  {service.status.extra ? <p className="hours-extra">{service.status.extra}</p> : null}
                  {service.note ? <p className="hours-note">{service.note}</p> : null}
                  <ServiceAction service={service} base={base} nl={nl} />
                </div>
              </div>

              <div className="hours-days">
                <p className="hours-mobile-label" aria-hidden>
                  {band.dayLabel}
                </p>
                <div className="hours-track" aria-hidden>
                  {service.unavailable ? (
                    <span className="hours-track-empty">{service.status.label}</span>
                  ) : service.bars.length === 0 ? (
                    <span className="hours-track-empty">{nl ? "Vandaag gesloten" : "Closed today"}</span>
                  ) : (
                    service.bars.map((bar, index) => <Bar key={index} bar={bar} />)
                  )}
                  {band.now ? <span className="hours-now" style={nowStyle} /> : null}
                </div>
                <div className="hours-ticks" aria-hidden>
                  {ticks}
                </div>

                {service.cells.length > 0 ? (
                  <>
                    <p className="hours-mobile-label" data-week data-next={band.nextWeek || undefined}>
                      {weekLabel}
                    </p>
                    <ul className="hours-week">
                      {service.cells.map((cell) => (
                        <li key={cell.day} className="hours-cell" data-today={cell.today || undefined}>
                          <span className="hours-cell-day">
                            <span aria-hidden>{cell.short}</span>
                            <span className="sr-only">
                              {cell.full}
                              {cell.today ? (nl ? " (vandaag)" : " (today)") : ""}
                            </span>
                          </span>
                          {cell.lines.length > 0 ? (
                            cell.lines.map((line) => (
                              <span key={line} className="hours-cell-time">
                                {line}
                              </span>
                            ))
                          ) : (
                            <span className="hours-cell-closed">
                              <span className="sr-only">{nl ? "gesloten" : "closed"}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <ul className="hours-legend" aria-hidden>
        <li>
          <span className="hours-legend-swatch" data-kind="active" />
          {nl ? "Nu open" : "Open now"}
        </li>
        {band.hasOpenEnd ? (
          <li>
            <span className="hours-legend-swatch" data-kind="tail" />
            {nl ? "Sluitingsuur varieert per avond" : "Closing time varies per night"}
          </li>
        ) : null}
        {band.now ? (
          <li>
            <span className="hours-legend-swatch" data-kind="now" />
            {nl ? "Nu" : "Now"}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
