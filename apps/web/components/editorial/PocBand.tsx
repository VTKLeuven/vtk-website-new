import Image from "next/image";
import Link from "@/components/ui/Link";
import { type Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { isExternalUrl, withLocaleBase } from "@/lib/href";
import { publicUrl } from "@/lib/storage";
import {
  pocBandDaysLeft,
  pocBandIsOpen,
  pocBandStepState,
  pocBandStepWhen,
  POC_BAND_DEFAULT_PHOTO,
  type PocBandSetting,
} from "@/lib/home/pocBand";

/**
 * De POC-band op de homepage, in navy.
 *
 * Twee weergaven op dezelfde plek in het bandenritme, omdat ze hetzelfde
 * beantwoorden op twee momenten van het jaar: wie vertegenwoordigt mijn
 * opleiding? In september is dat "nog niemand, stel je kandidaat" en de rest van
 * het jaar een rij gezichten. Welke van de twee er staat, kiest de redactie in
 * /admin/pocs; zie lib/home/pocBand.ts voor waarom dat geen automatisme is.
 *
 * De vertegenwoordigers staan hier in dezelfde taal als /pocs: de naam van de
 * POC in de linkermarge, de portretten los op de band.
 *
 * Het verkiezingspaneel opent met een foto die de kaartrand raakt. De redactie
 * vervangt ze via /admin/pocs; zonder upload staat er de meegeleverde
 * `POC_BAND_DEFAULT_PHOTO`. Zie docs/design-decisions.md.
 */

/** Eén vertegenwoordiger zoals de band hem toont. */
export type PocBandPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role?: string | null;
};

export type PocBandGroup = {
  id: string;
  name: string;
  email: string | null;
  people: PocBandPerson[];
};

/** De maat waarop `.poc-wall-face` staat; zie vtk-home.css. */
const FACE_PX = 140;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Face({ person }: { person: PocBandPerson }) {
  return (
    <div className={"poc-wall-face" + (person.avatarUrl ? "" : " is-blank")}>
      {person.avatarUrl ? (
        <Image
          src={person.avatarUrl}
          alt={person.name}
          width={FACE_PX}
          height={FACE_PX}
          className="poc-wall-photo"
        />
      ) : (
        <span className="poc-wall-initial" aria-hidden="true">
          {initials(person.name)}
        </span>
      )}
    </div>
  );
}

/**
 * De knoppen van de verkiezingsweergave. Een adres uit de admin mag een pad op
 * deze site zijn, dus het taalvoorvoegsel komt er hier voor en een extern adres
 * opent in een nieuw tabblad; zie lib/href.ts.
 */
function BandLink({
  href,
  base,
  className,
  children,
}: {
  href: string;
  base: string;
  className: string;
  children: React.ReactNode;
}) {
  if (isExternalUrl(href)) {
    return (
      <a className={className} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={className} href={withLocaleBase(href, base)}>
      {children}
    </Link>
  );
}

export function PocBand({
  locale,
  base,
  now,
  setting,
  groups,
  myProgrammes,
}: {
  locale: Locale;
  base: string;
  now: Date;
  setting: PocBandSetting;
  /** De POC's van jouw richtingen die dit werkingsjaar mensen hebben. */
  groups: PocBandGroup[];
  /** De namen van je eigen richtingen, voor de regel onderaan de verkiezingsband. */
  myProgrammes: string[];
}) {
  const nl = locale === "nl";
  const pick = (dutch: string, english: string) => (nl ? dutch : english || dutch);

  if (setting.mode === "hidden") return null;

  if (setting.mode === "elections") {
    const heading = pick(setting.headingNl, setting.headingEn).trim();
    const body = pick(setting.bodyNl, setting.bodyEn).trim();
    const title = pick(setting.titleNl, setting.titleEn).trim();
    const ctaLabel = pick(setting.ctaLabelNl, setting.ctaLabelEn).trim();
    const secondaryLabel = pick(setting.secondaryLabelNl, setting.secondaryLabelEn).trim();
    const open = pocBandIsOpen(setting, now);
    const daysLeft = pocBandDaysLeft(setting.deadline, now);

    // Een band zonder kop en zonder tekst is een leeg navy vlak tussen twee
    // secties. Dan staat de instelling wel op `elections`, maar heeft nog
    // niemand er iets in gezet.
    if (!heading && !body && !title) return null;

    const meta = pick(setting.metaNl, setting.metaEn).trim();
    const photo = publicUrl(setting.imageKey) ?? POC_BAND_DEFAULT_PHOTO;

    return (
      <section className="section band poc-band" aria-labelledby="poc-band-head">
        <div className="sec-head">
          <h2 id="poc-band-head">{heading}</h2>
          {meta ? <div className="meta">{meta}</div> : null}
        </div>

        <div className="poc-elect">
          <div className="poc-elect-panel">
            {/* De foto raakt de kaartrand en draagt geen tekst, dus ook geen
                waas: de kolom is de foto. Zie docs/design-decisions.md. */}
            <span className="poc-elect-photo" aria-hidden="true">
              <Image
                src={photo}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1080px) 92vw, 340px"
              />
            </span>

            <div className="poc-elect-prose">
              {title ? <h3>{title}</h3> : null}
              {body ? <Markdown locale={locale}>{body}</Markdown> : null}
            </div>

            <aside className="poc-elect-aside">
              {setting.deadline ? (
                <div className="poc-elect-deadline">
                  <p className="k">
                    {open
                      ? nl
                        ? "Kandidaat stellen tot"
                        : "Put yourself forward until"
                      : nl
                        ? "Kandidaatstelling gesloten sinds"
                        : "Candidacy closed since"}
                  </p>
                  <p className="v">
                    {new Date(setting.deadline).toLocaleString(nl ? "nl-BE" : "en-GB", {
                      timeZone: "Europe/Brussels",
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {daysLeft !== null ? (
                    <p className="sub">
                      {daysLeft === 0
                        ? nl
                          ? "Vandaag is de laatste dag"
                          : "Today is the last day"
                        : daysLeft === 1
                          ? nl
                            ? "Nog 1 dag"
                            : "1 day left"
                          : nl
                            ? `Nog ${daysLeft} dagen`
                            : `${daysLeft} days left`}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {(ctaLabel && setting.ctaUrl) || (secondaryLabel && setting.secondaryUrl) ? (
                <div className="poc-elect-actions">
                  {ctaLabel && setting.ctaUrl ? (
                    <BandLink
                      href={setting.ctaUrl}
                      base={base}
                      className={open ? "btn btn-primary" : "btn btn-ghost"}
                    >
                      {ctaLabel}
                    </BandLink>
                  ) : null}
                  {secondaryLabel && setting.secondaryUrl ? (
                    <BandLink href={setting.secondaryUrl} base={base} className="btn btn-ghost">
                      {secondaryLabel}
                    </BandLink>
                  ) : null}
                </div>
              ) : null}

              {myProgrammes.length > 0 ? (
                <p className="poc-elect-mine">
                  {nl ? "Voor jouw richtingen: " : "For your programmes: "}
                  {myProgrammes.map((name, index) => (
                    <span key={name}>
                      {index > 0 ? (index === myProgrammes.length - 1 ? (nl ? " en " : " and ") : ", ") : ""}
                      <b>{name}</b>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
            </aside>
          </div>

          {setting.steps.length > 0 ? (
            <ol className="poc-elect-steps">
              {setting.steps.map((step) => {
                const when = pocBandStepWhen(step, locale);
                return (
                  <li
                    key={`${step.titleNl}-${step.from ?? ""}`}
                    className="poc-elect-step"
                    data-state={pocBandStepState(step, now)}
                  >
                    {when ? <p className="when">{when}</p> : null}
                    <h4>{pick(step.titleNl, step.titleEn)}</h4>
                    {pick(step.bodyNl, step.bodyEn) ? <p>{pick(step.bodyNl, step.bodyEn)}</p> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      </section>
    );
  }

  // Vertegenwoordigers. Zonder sessie, zonder richtingen of zonder verkozen
  // mensen valt de hele band weg: een lijst van alle POC's is hier niet wat
  // gevraagd wordt, en /pocs staat één klik verder.
  if (groups.length === 0) return null;

  return (
    <section className="section band poc-band" aria-labelledby="poc-band-head">
      <div className="sec-head">
        <h2 id="poc-band-head">
          {nl ? "Jouw studentenvertegenwoordigers." : "Your student representatives."}
        </h2>
        <div className="meta">
          {nl ? "Op basis van je richtingen" : "Based on your programmes"} ·{" "}
          <Link href={`${base}/pocs`}>{nl ? "bekijk alle POC's" : "see all POCs"}</Link>
        </div>
      </div>

      <div className="poc-wall">
        {groups.map((group) => (
          <div className="poc-wall-row" key={group.id}>
            <div className="poc-wall-label">
              <h3>{group.name}</h3>
              {/* Studenten mailen de POC als geheel, niet één vertegenwoordiger. */}
              {group.email ? (
                <a className="poc-wall-mail" href={`mailto:${group.email}`}>
                  {group.email}
                </a>
              ) : null}
            </div>
            <ul className="poc-wall-faces">
              {group.people.map((person) => (
                <li key={person.id}>
                  <Face person={person} />
                  <p className="poc-wall-name">{person.name}</p>
                  {person.role ? <p className="poc-wall-role">{person.role}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
