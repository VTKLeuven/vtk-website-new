import Link from "next/link";
import { pick } from "@vtk/i18n";
import { pickField } from "@/lib/frontpage/fields";
import { Cta, ctaFrom, type FrontpageProps } from "./context";

/**
 * The regular front page: copy on the left, the agenda card on the right.
 *
 * Every text is a field with the wording we have always shipped as its fallback,
 * so an untouched database looks exactly like before and an admin can still
 * rewrite the headline without a deploy.
 *
 * The headline is deliberately three fields (`title`, `accent`, `tail`) rather
 * than one: the yellow italic accent sits *inside* the sentence ("De thuis voor
 * **ingenieurs** in Leuven"), which one text field cannot express without
 * letting HTML into the admin.
 */
export function DefaultFrontpage({
  values,
  locale,
  base,
  now,
  upcomingEvents,
}: FrontpageProps) {
  const nl = locale === "nl";

  const eyebrow = pickField(values, "eyebrow", locale) ?? "Vlaamse Technische Kring · KU Leuven";
  const title = pickField(values, "title", locale) ?? (nl ? "De thuis voor" : "The home for");
  const accent = pickField(values, "accent", locale) ?? (nl ? "ingenieurs" : "engineers");
  const tail = pickField(values, "tail", locale) ?? (nl ? "in Leuven." : "in Leuven.");
  const subtitle =
    pickField(values, "subtitle", locale) ??
    (nl
      ? "Events, cursussen, career, broodjes en alles wat je dag op de campus praktischer maakt. Gerund door studenten, sinds 1920."
      : "Events, courses, careers, sandwiches and everything that makes your day on campus more practical. Run by students, since 1920.");

  const primary =
    ctaFrom(
      pickField(values, "primaryLabel", locale) ?? (nl ? "Ontdek wat we doen" : "Discover what we do"),
      values.primaryUrl ?? "/info",
      base,
    );
  const secondary = ctaFrom(
    pickField(values, "secondaryLabel", locale) ??
      (nl ? "Eerstejaars? Start hier" : "First-year? Start here"),
    values.secondaryUrl ?? "/eerstejaars",
    base,
  );

  const dayKey = (d: Date) =>
    d.toLocaleDateString(nl ? "nl-BE" : "en-GB", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    });
  const monthLabel = (d: Date) => {
    const month = d
      .toLocaleDateString(nl ? "nl-BE" : "en-GB", { month: "short" })
      .replace(".", "");
    return d.getFullYear() === now.getFullYear()
      ? month
      : `${month} '${String(d.getFullYear()).slice(-2)}`;
  };
  const formatTime = (d: Date) =>
    d.toLocaleTimeString(nl ? "nl-BE" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  const eventGroups = upcomingEvents.slice(0, 5).reduce<
    Array<{ key: string; date: Date; events: FrontpageProps["upcomingEvents"] }>
  >((acc, event) => {
    const date = new Date(event.start);
    const key = dayKey(date);
    const found = acc.find((g) => g.key === key);
    if (found) found.events.push(event);
    else acc.push({ key, date, events: [event] });
    return acc;
  }, []);

  const workingYear = (() => {
    // The working year starts on 15 July; see @vtk/auth.
    const y = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() >= 15)
      ? now.getFullYear()
      : now.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
  })();

  return (
    <section className="home-hero">
      <div>
        <div className="eyebrow">
          <span className="dot" />
          {eyebrow}
        </div>
        <h1>
          {title} <span className="serif">{accent}</span>
          <br />
          {tail}
        </h1>
        <p className="hero-sub">{subtitle}</p>
        <div className="hero-cta">
          <Cta cta={primary} className="btn btn-primary arrow" />
          <Cta cta={secondary} className="btn btn-ghost" />
        </div>
        <div className="hero-meta">
          <div className="meta">
            <div className="k">{nl ? "Werkingsjaar" : "Working year"}</div>
            <div className="v">{workingYear}</div>
          </div>
          <div className="meta">
            <div className="k">{nl ? "Binnenkort" : "This week"}</div>
            <div className="v">
              {upcomingEvents.length} {nl ? "events" : "events"}
            </div>
          </div>
          <div className="meta">
            <div className="k">{nl ? "Sinds" : "Since"}</div>
            <div className="v">1920</div>
          </div>
        </div>
      </div>

      <aside className="hero-cal">
        <div className="hero-cal-head">
          <div>
            <h3>{nl ? "Aankomende events" : "Upcoming events"}</h3>
            <div className="sub">
              {upcomingEvents[0]
                ? `${dayKey(new Date(upcomingEvents[0].start))} → ${dayKey(
                    new Date(upcomingEvents[Math.min(upcomingEvents.length - 1, 4)].start),
                  )}`
                : nl
                  ? "Geen geplande events"
                  : "No planned events"}
            </div>
          </div>
          <Link href={`${base}/kalender`} className="all">
            {nl ? "Volledige kalender" : "Full calendar"}
          </Link>
        </div>
        <div className="hero-agenda">
          {eventGroups.length === 0 ? (
            <div className="hero-day">
              <div className="hero-day-label">
                <span className="num">—</span>
                <span className="dow">{nl ? "Geen data" : "No data"}</span>
              </div>
            </div>
          ) : (
            eventGroups.map((group, groupIndex) => (
              <div className="hero-day" key={group.key}>
                <div className="hero-day-label">
                  <span className="num">{String(group.date.getDate()).padStart(2, "0")}</span>
                  <span className="mon">{monthLabel(group.date)}</span>
                  <span className="dow">
                    {group.date.toLocaleDateString(nl ? "nl-BE" : "en-GB", { weekday: "long" })}
                  </span>
                  {group.date.toDateString() === now.toDateString() ? (
                    <span className="today">{nl ? "vandaag" : "today"}</span>
                  ) : null}
                </div>
                {group.events.map((event, eventIndex) => (
                  <Link
                    key={event.id}
                    href={`${base}/kalender/${event.id}`}
                    className={`hero-ev${groupIndex === 0 && eventIndex === 0 ? " featured" : ""}`}
                  >
                    <div className="t">{formatTime(new Date(event.start))}</div>
                    <div className="n">
                      {groupIndex === 0 && eventIndex === 0 ? <span className="pin" /> : null}
                      {pick(event.titleNl, event.titleEn ?? event.titleNl, locale)}
                      <small>
                        {[event.location, pick(event.group.nameNl, event.group.nameEn, locale)]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                      {/* Enkel wanneer er al volk naartoe gaat; de drempel zit
                          aan de serverkant, dus een laag getal komt hier niet. */}
                      {event.interestedCount ? (
                        <span className="hero-ev-going">
                          {event.interestedCount} {nl ? "komen" : "going"}
                        </span>
                      ) : null}
                    </div>
                    {/* Own class: the global `.arrow` would glue a second arrow
                        on with ::after. */}
                    <span className="ev-go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}
