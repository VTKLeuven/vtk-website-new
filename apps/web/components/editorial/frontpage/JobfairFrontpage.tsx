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
export function JobfairFrontpage({ locale, base, partners }: FrontpageProps) {
  const nl = locale === "nl";

  const register = ctaFrom(
    nl ? "Meer over de Jobfair" : "More about the Job fair",
    "https://career.vtk.be/event/vtk-jobfair",
    base,
  );

  // Twelve is two tidy rows of six on a wide screen; beyond that the wall stops
  // reading as a wall and starts reading as a directory.
  const wall = partners.slice(0, 12);

  return (
    <section className={`home-hero fp-jobfair${wall.length === 0 ? " fp-jobfair-solo" : ""}`}>
      <div>
        <h1>
          {nl ? "Ontmoet je toekomstige" : "Meet your future"}{" "}
          <span className="serif">{nl ? "werkgever." : "employer."}</span>
        </h1>

        <div className="hero-cta">
          <Cta cta={register} className="btn btn-primary arrow" />
        </div>
      </div>

      {wall.length > 0 ? (
        <aside className="fp-wall" aria-label={nl ? "Deelnemende bedrijven" : "Participating companies"}>
          {wall.map((partner) => partner.url ? (
            <a
              className="fp-wall-cell"
              key={partner.id}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${partner.name} (${nl ? "opent in een nieuw tabblad" : "opens in a new tab"})`}
            >
              <PartnerLogo src={publicUrl(partner.logoKey)} name={partner.name} />
            </a>
          ) : (
            <div className="fp-wall-cell" key={partner.id}>
              <PartnerLogo src={publicUrl(partner.logoKey)} name={partner.name} />
            </div>
          ))}
        </aside>
      ) : null}
    </section>
  );
}
