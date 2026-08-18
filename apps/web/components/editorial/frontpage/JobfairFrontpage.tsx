import { pickField } from "@/lib/frontpage/fields";
import { PartnerLogo } from "@/components/site/PartnerLogo";
import { publicUrl } from "@/lib/storage";
import { Cta, ctaFrom, type FrontpageProps } from "./context";

/**
 * The jobfair front page.
 *
 * The argument for coming is *which companies are there*, so the right-hand side
 * is a wall of their logos rather than a countdown or an agenda. They come from
 * the active partners already in the database, so nobody maintains a second list
 * that quietly goes stale.
 *
 * With no partners the wall collapses and the copy takes the full width: an
 * empty grid of placeholder tiles would advertise the opposite of what the page
 * is for.
 */
export function JobfairFrontpage({ values, locale, base, partners }: FrontpageProps) {
  const nl = locale === "nl";

  const when = pickField(values, "when", locale);
  const title =
    pickField(values, "title", locale) ?? (nl ? "Ontmoet je toekomstige" : "Meet your future");
  const accent = pickField(values, "accent", locale) ?? (nl ? "werkgever." : "employer.");
  const subtitle = pickField(values, "subtitle", locale);

  const register = ctaFrom(pickField(values, "registerLabel", locale), values.registerUrl, base);
  const list = ctaFrom(pickField(values, "listLabel", locale), values.listUrl, base);

  // career.vtk.be sells the fair on its scale, with the numbers set in gold
  // inside the opening line. Two free stats carry that over.
  const stats = [1, 2]
    .map((i) => ({
      value: values[`stat${i}Value`],
      label: pickField(values, `stat${i}Label`, locale),
    }))
    .filter((s) => s.value);

  // Twelve is two tidy rows of six on a wide screen; beyond that the wall stops
  // reading as a wall and starts reading as a directory.
  const wall = partners.slice(0, 12);

  return (
    <section className={`home-hero fp-jobfair${wall.length === 0 ? " fp-jobfair-solo" : ""}`}>
      <div>
        {when ? (
          <div className="eyebrow">
            <span className="dot" />
            {when}
          </div>
        ) : null}
        <h1>
          {title} <span className="serif">{accent}</span>
        </h1>
        {subtitle ? <p className="hero-sub">{subtitle}</p> : null}

        {stats.length > 0 ? (
          <div className="fp-jobfair-stats">
            {stats.map((stat, i) => (
              <div className="fp-jobfair-stat" key={i}>
                <span className="n">{stat.value}</span>
                {stat.label ? <span className="l">{stat.label}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        {register || list ? (
          <div className="hero-cta">
            <Cta cta={register} className="btn btn-primary arrow" />
            <Cta cta={list} className="btn btn-ghost" />
          </div>
        ) : null}
      </div>

      {wall.length > 0 ? (
        <aside className="fp-wall" aria-label={nl ? "Deelnemende bedrijven" : "Participating companies"}>
          {wall.map((partner) => (
            <div className="fp-wall-cell" key={partner.id}>
              <PartnerLogo src={publicUrl(partner.logoKey)} name={partner.name} />
            </div>
          ))}
        </aside>
      ) : null}
    </section>
  );
}
