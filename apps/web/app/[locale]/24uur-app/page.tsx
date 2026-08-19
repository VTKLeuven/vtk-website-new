import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { buildMetadata } from "@/lib/seo";
import { readAccessCookie } from "@/lib/urenloopApp/access";
import { readReleaseManifest, formatBytes } from "@/lib/urenloopApp/release";
import { PLATFORM_FILES, CODE_TTL_MINUTES } from "@/lib/urenloopApp/config";
import { DownloadGate } from "./DownloadGate";
import { PlatformMark, DownloadArrow } from "./PlatformMark";
import "@/app/design/vtk-urenloop-app.css";

/**
 * `/24uur-app`: waar andere kringen de 24urenloop-desktopapp ophalen.
 *
 * De app zelf staat in een privé-repository en de installatiebestanden in onze
 * objectopslag; die is niet publiek bereikbaar. Deze pagina is de enige ingang,
 * en ze vraagt eerst om een adres dat op de lijst staat (Admin -> IT -> 24UL App
 * Download). De pagina wordt nooit gecacht: wat je te zien krijgt hangt af van
 * je cookie.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) return {};
  const locale = localeParam as Locale;
  const nl = locale === "nl";
  return {
    ...buildMetadata({
      title: nl ? "24urenloop-app" : "24urenloop app",
      description: nl
        ? "De 24urenloop-app downloaden, voor kringen die er toegang toe hebben."
        : "Download the 24urenloop app, for associations that have access.",
      path: "/24uur-app",
      locale,
    }),
    // Een privépagina hoort in geen enkele zoekmachine te staan.
    robots: { index: false, follow: false },
  };
}

/** "2026-04-14T09:12:00Z" -> "14 apr 2026". Leeg bij een onbruikbare datum. */
function formatBuildDate(value: string, locale: Locale): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function UrenloopAppPage({ params }: { params: Params }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale = localeParam as Locale;
  const nl = locale === "nl";

  const email = await readAccessCookie();
  // De cookie zegt enkel dat iemand ooit een code inwisselde; of het adres nog
  // op de lijst staat is een aparte vraag, en die stellen we bij elk bezoek.
  const unlocked = email
    ? Boolean(await prisma.urenloopDownloadEmail.findUnique({ where: { email } }))
    : false;

  const release = unlocked ? await readReleaseManifest() : null;
  const sizes = new Map((release?.files ?? []).map((f) => [f.name, f.bytes]));
  const builtAt = formatBuildDate(release?.builtAt ?? "", locale);

  const platforms = [
    {
      id: "windows" as const,
      label: "Windows",
      hint: nl ? "Windows 10 en 11" : "Windows 10 and 11",
    },
    {
      id: "mac" as const,
      label: "Mac",
      hint: nl ? "Apple Silicon en Intel" : "Apple Silicon and Intel",
    },
    {
      id: "linux" as const,
      label: "Ubuntu",
      hint: nl ? "en andere .deb-systemen" : "and other .deb systems",
    },
  ];

  const mailLink = (
    <a className="vtk-link" href="mailto:it@vtk.be">
      it@vtk.be
    </a>
  );

  return (
    <>
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{nl ? "24urenloop-app" : "24urenloop app"}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Het scorebord en de wisselaars voor de 24urenloop, als app voor je eigen computer."
              : "The scoreboard and runner queue for the 24urenloop, as an app for your own computer."}
          </p>
        </div>
        {/* Het rechtervak van de paginakop. Vergrendeld staat er geen versie in:
            die kennen we pas na het inwisselen van een code. */}
        <div className="page-head-meta">
          {unlocked ? (
            <>
              {release ? (
                <div>
                  {nl ? "Versie" : "Version"} <b>{release.version}</b>
                </div>
              ) : null}
              {builtAt ? (
                <div>
                  {nl ? "Gebouwd" : "Built"} <b>{builtAt}</b>
                </div>
              ) : null}
            </>
          ) : (
            <div>
              {nl ? "Toegang" : "Access"} <b>{nl ? "Op uitnodiging" : "By invitation"}</b>
            </div>
          )}
        </div>
      </header>

      <div className="vtk-page-shell">
        {unlocked ? (
          <div className="vtk-ulapp-grid">
            <section className="vtk-panel vtk-ulapp-main" aria-labelledby="downloads-title">
              <h2 id="downloads-title">{nl ? "Downloaden" : "Downloads"}</h2>
              <p className="vtk-ulapp-lead">
                {nl
                  ? "Open het bestand na het downloaden; de app installeert en start zichzelf."
                  : "Open the file once it has downloaded; the app installs and starts on its own."}
              </p>

              <ul className="vtk-ulapp-list">
                {platforms.map((platform) => {
                  const { filename } = PLATFORM_FILES[platform.id];
                  const bytes = sizes.get(filename);
                  const size = bytes ? formatBytes(bytes) : "";
                  return (
                    <li key={platform.id}>
                      <a className="vtk-ulapp-row" href={`/api/24ul-app/download/${platform.id}`}>
                        <span className="vtk-ulapp-mark">
                          <PlatformMark id={platform.id} />
                        </span>
                        <span>
                          <span className="vtk-ulapp-row-name">{platform.label}</span>
                          <span className="vtk-ulapp-row-meta">
                            {filename}
                            {size ? ` · ${size}` : ""} · {platform.hint}
                          </span>
                        </span>
                        <span className="vtk-ulapp-row-go">
                          <DownloadArrow />
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>

              <div className="vtk-ulapp-inset">
                <h3>
                  {nl
                    ? "Windows en macOS waarschuwen dat de maker onbekend is"
                    : "Windows and macOS warn that the publisher is unknown"}
                </h3>
                <p>
                  {nl
                    ? "Dat klopt: VTK heeft geen betaald ontwikkelaarscertificaat. Kies op Windows Meer info en dan Toch uitvoeren; op Mac ga je naar Systeeminstellingen > Privacy en beveiliging > Toch openen."
                    : "That is expected: VTK has no paid developer certificate. On Windows choose More info and then Run anyway; on Mac go to System Settings > Privacy & Security > Open Anyway."}
                </p>
              </div>
            </section>

            <aside className="vtk-ulapp-aside">
              {release ? (
                <div className="vtk-ulapp-box">
                  <h2>{nl ? "Deze build" : "This build"}</h2>
                  <dl className="vtk-ulapp-spec">
                    <dt>{nl ? "Versie" : "Version"}</dt>
                    <dd>{release.version}</dd>
                    {release.commit ? (
                      <>
                        <dt>Commit</dt>
                        <dd>{release.commit.slice(0, 7)}</dd>
                      </>
                    ) : null}
                    {builtAt ? (
                      <>
                        <dt>{nl ? "Gebouwd" : "Built"}</dt>
                        <dd>{builtAt}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              ) : null}
              <div className="vtk-ulapp-box">
                <h2>{nl ? "Hulp nodig" : "Need help"}</h2>
                <p>
                  {nl ? "Vragen, of iets kapot? Mail " : "Questions, or something broken? Mail "}
                  {mailLink}.
                </p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="vtk-ulapp-grid">
            <section className="vtk-panel vtk-ulapp-main" aria-labelledby="access-title">
              <DownloadGate locale={locale} ttlMinutes={CODE_TTL_MINUTES} />
            </section>

            <aside className="vtk-ulapp-aside">
              <div className="vtk-ulapp-box">
                <h2>{nl ? "Geen toegang" : "No access"}</h2>
                <p>
                  {nl
                    ? "Staat jouw kring nog niet op de lijst? Mail "
                    : "Is your association not on the list yet? Mail "}
                  {mailLink}
                  {nl ? " en we kijken ernaar." : " and we will look into it."}
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
