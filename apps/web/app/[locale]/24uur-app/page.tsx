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
      </header>

      <div className="vtk-page-shell">
        {unlocked ? (
          <section className="vtk-panel" aria-labelledby="downloads-title">
            <h2 id="downloads-title">{nl ? "Downloaden" : "Downloads"}</h2>
            <p className="mt-1 text-sm text-[#5c667f]">
              {release
                ? nl
                  ? `Versie ${release.version}. Open het bestand na het downloaden; de app installeert en start zichzelf.`
                  : `Version ${release.version}. Open the file once it has downloaded; the app installs and starts on its own.`
                : nl
                  ? "Open het bestand na het downloaden; de app installeert en start zichzelf."
                  : "Open the file once it has downloaded; the app installs and starts on its own."}
            </p>

            <ul className="mt-5 space-y-3">
              {platforms.map((platform) => {
                const bytes = sizes.get(PLATFORM_FILES[platform.id].filename);
                const size = bytes ? formatBytes(bytes) : "";
                return (
                  <li key={platform.id}>
                    <a
                      className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface)] px-5 py-4 no-underline transition hover:border-[color:var(--navy)]"
                      href={`/api/24ul-app/download/${platform.id}`}
                    >
                      <span>
                        <strong className="block text-[color:var(--ink)]">{platform.label}</strong>
                        <span className="text-sm text-[#5c667f]">
                          {PLATFORM_FILES[platform.id].filename}
                          {size ? ` · ${size}` : ""} · {platform.hint}
                        </span>
                      </span>
                      <span aria-hidden className="text-[color:var(--muted)]">
                        &darr;
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 text-sm text-[#5c667f]">
              {nl
                ? "Windows en macOS waarschuwen dat de maker onbekend is; dat klopt, VTK heeft geen betaald ontwikkelaarscertificaat. Kies op Windows Meer info en dan Toch uitvoeren, en op Mac Systeeminstellingen > Privacy en beveiliging > Toch openen."
                : "Windows and macOS warn that the publisher is unknown; that is expected, VTK has no paid developer certificate. On Windows choose More info and then Run anyway; on Mac use System Settings > Privacy & Security > Open Anyway."}
            </p>
            <p className="mt-2 text-sm text-[#5c667f]">
              {nl
                ? "Vragen of iets kapot? Mail it@vtk.be."
                : "Questions, or something broken? Mail it@vtk.be."}
            </p>
          </section>
        ) : (
          <section className="vtk-panel" aria-labelledby="access-title">
            <h2 id="access-title">{nl ? "Toegang" : "Access"}</h2>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? `De app is enkel voor kringen waarmee we ze delen. Vul het adres in waarmee je toegang kreeg; je krijgt er een code op, die ${CODE_TTL_MINUTES} minuten geldig is.`
                : `The app is only for associations we share it with. Enter the address you were given access with; we mail a code to it that stays valid for ${CODE_TTL_MINUTES} minutes.`}
            </p>
            <DownloadGate locale={locale} />
          </section>
        )}
      </div>
    </>
  );
}
