import { HERO_WEEK_NEXT_LIMIT_DEFAULT } from "@/lib/calendar/heroWeek";
import { HERO_SHIFT_MAX_ROWS, pickHeroShifts } from "@/lib/frontpage/heroShifts";
import { HeroWeek } from "./HeroWeek";
import { HeroShifts } from "./HeroShifts";
import { Cta, ctaFrom, type FrontpageProps } from "./context";

/** Hoe donker de waas achter de agenda staat, in procent. */
const AGENDA_DIM = 88;

/**
 * De oude hero: tekst links, het weekoverzicht rechts, op de foto van het kasteel.
 * De teksten staan vast in de code; er is geen scherm meer om ze te wijzigen.
 */
export function DefaultFrontpage({
  locale,
  base,
  now,
  weekEvents,
  signedIn,
  openShifts,
}: FrontpageProps) {
  const nl = locale === "nl";

  const primary = ctaFrom(nl ? "Ontdek wat we doen" : "Discover what we do", "/info", base);
  // De tweede knop wijst elke taal naar haar eigen publiek: een Nederlandstalige
  // bezoeker is hier een eerstejaars, wie de site op Engels leest een
  // uitwisselingsstudent.
  const secondary = ctaFrom(
    nl ? "Eerstejaars? Start hier" : "International? Start here",
    nl ? "/eerstejaars" : "/internationals",
    base,
  );

  const heroShifts = pickHeroShifts(openShifts, { now, limit: HERO_SHIFT_MAX_ROWS });

  return (
    <section className="home-hero">
      <div>
        <div className="eyebrow">
          <span className="dot" />
          Vlaamse Technische Kring · KU Leuven
        </div>
        <h1 className="hero-title">
          <span>{nl ? "De thuis voor" : "The home for"}</span>
          <span className="serif">{nl ? "ingenieurs" : "engineers"}</span>
          <span>{nl ? "in Leuven." : "in Leuven."}</span>
        </h1>
        <p className="hero-sub">
          {nl
            ? "Events, cursussen, career, broodjes en alles wat je dag op de campus praktischer maakt. Gerund door studenten, sinds 1920."
            : "Events, courses, careers, sandwiches and everything that makes your day on campus more practical. Run by students, since 1920."}
        </p>
        <div className="hero-cta">
          <Cta cta={primary} className="btn btn-primary arrow" />
          <Cta cta={secondary} className="btn btn-ghost" />
        </div>
        {/* De shiften zijn de voet van de kolom en hangen aan de onderkant
            (`margin-top: auto` in vtk-home.css), zodat ze uitkomen op de
            onderlijn van de agenda ernaast. De lucht die de titel overlaat, komt
            daardoor boven dit blok te staan en niet eronder. De feitenlijn die
            hier onder stond (werkingsjaar, binnenkort, sinds) is weg: haar
            hoogte ging naar de shiften. */}
        <div className="hero-foot">
          <HeroShifts shifts={heroShifts} now={now} locale={locale} base={base} />
        </div>
      </div>

      <HeroWeek
        events={weekEvents}
        now={now}
        locale={locale}
        base={base}
        signedIn={signedIn}
        dim={AGENDA_DIM}
        nextEventsLimit={HERO_WEEK_NEXT_LIMIT_DEFAULT}
      />
    </section>
  );
}
