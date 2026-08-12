import Link from "next/link";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { magazineViewUrl } from "@/lib/analytics";
import type { MediaPublication } from "@/lib/media-content";
import { magazineStats, type UmamiPeriod } from "@/lib/umami-stats";

/**
 * Hoe vaak elk nummer gelezen is, bovenaan het mediabeheer.
 *
 * Dit was de reden om Umami te draaien: de redacties van 't Bakske en Ir.Reëel
 * wilden zien of hun werk gelezen wordt. Ze hebben geen Umami-login, dus komen
 * de cijfers naar de plek waar ze de nummers toch al uploaden.
 *
 * Bewust geen tabel in een horizontale scroller: die combinatie vraagt een
 * `position: relative` op de wrapper, anders zoekt een telefoon de `sr-only`-tekst
 * ergens op de pagina en zoomt hij het hele scherm uit (zie CLAUDE.md, het heeft
 * ooit een namiddag gekost op /admin/tickets). Een grid die onder `sm` naar twee
 * regels klapt heeft dat probleem niet.
 */

const PERIODS: ReadonlyArray<{ value: UmamiPeriod; nl: string; en: string }> = [
  { value: "30d", nl: "30 dagen", en: "30 days" },
  { value: "jaar", nl: "Dit werkingsjaar", en: "This working year" },
  { value: "alles", nl: "Alles", en: "All time" },
];

export function parsePeriod(value: string | string[] | undefined): UmamiPeriod {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "jaar" || raw === "alles" ? raw : "30d";
}

type Row = {
  id: string;
  label: string;
  views: number;
  downloads: number;
};

export async function MagazineStats({
  locale,
  publications,
  period,
}: {
  locale: Locale;
  publications: MediaPublication[];
  period: UmamiPeriod;
}) {
  const nl = locale === "nl";
  const stats = await magazineStats(period);

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-semibold">{nl ? "Statistieken" : "Statistics"}</h2>
          <p className="text-sm text-zinc-500">
            {nl
              ? "Hoe vaak een nummer geopend is op de mediapagina."
              : "How often an issue was opened on the media page."}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label={nl ? "Periode" : "Period"}>
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={`?stats=${option.value}`}
              scroll={false}
              aria-current={option.value === period ? "true" : undefined}
              className={
                option.value === period
                  ? "rounded-full bg-vtk-ink px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/60"
              }
            >
              {nl ? option.nl : option.en}
            </Link>
          ))}
        </nav>
      </div>

      {!stats.ok ? (
        <p className="text-sm text-zinc-500">{errorMessage(stats.error, nl)}</p>
      ) : publications.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {nl ? "Nog geen edities om te tellen." : "No issues to count yet."}
        </p>
      ) : (
        <div className="space-y-5">
          {groupRows(publications, stats.views, stats.downloads, nl).map((group) => (
            <section key={group.kind}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-vtk-ink">{group.title}</h3>
                <p className="text-xs text-zinc-500">
                  {formatNumber(group.total, nl)} {nl ? "weergaven" : "views"}
                </p>
              </div>
              <ul className="divide-y divide-zinc-200">
                {group.rows.map((row) => (
                  <li
                    key={row.id}
                    // Eén regel op een breed scherm, twee op een telefoon: de
                    // cijfers zakken dan onder de titel in plaats van ze plat te
                    // knijpen.
                    className="grid grid-cols-1 gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <span className="min-w-0 text-sm text-vtk-ink">{row.label}</span>
                    <span className="flex items-center gap-3 text-sm tabular-nums text-zinc-600 sm:justify-end">
                      <span className="font-medium text-vtk-ink">
                        {formatNumber(row.views, nl)}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {nl ? "weergaven" : "views"}
                      </span>
                      {row.downloads > 0 ? (
                        <span className="text-xs text-zinc-500">
                          · {formatNumber(row.downloads, nl)} {nl ? "downloads" : "downloads"}
                        </span>
                      ) : null}
                    </span>
                    {/* De balk toont de verhouding tot het best gelezen nummer;
                        losse getallen naast elkaar zeggen op het eerste zicht
                        weinig. */}
                    <span
                      aria-hidden="true"
                      className="h-1 rounded-full bg-vtk-blue-soft sm:col-span-2"
                    >
                      <span
                        className="block h-1 rounded-full bg-vtk-ink/70"
                        style={{ width: `${share(row.views, group.max)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-zinc-500">
            {nl
              ? `Geteld sinds ${formatDate(stats.since, nl)}. Enkel bezoekers die statistieken aanvaard hebben, tellen mee.`
              : `Counted since ${formatDate(stats.since, nl)}. Only visitors who accepted analytics are included.`}
          </p>
        </div>
      )}
    </Card>
  );
}

function errorMessage(error: "not_configured" | "unreachable" | "umami_error", nl: boolean): string {
  if (error === "not_configured") {
    return nl
      ? "Nog niet ingesteld. Zet in Umami een Share URL aan voor de website en vul het id ervan in als UMAMI_SHARE_ID."
      : "Not configured yet. Enable a Share URL for the website in Umami and set its id as UMAMI_SHARE_ID.";
  }
  return nl
    ? "De statistiekserver antwoordde niet. De cijfers komen terug zodra hij weer bereikbaar is; er gaat niets verloren."
    : "The analytics server did not respond. The numbers return once it is reachable again; nothing is lost.";
}

/** Per publicatie een blok, met de nummers in de volgorde van de boekenplank. */
function groupRows(
  publications: MediaPublication[],
  views: Record<string, number>,
  downloads: Record<string, number>,
  nl: boolean,
): Array<{ kind: string; title: string; rows: Row[]; total: number; max: number }> {
  const groups = new Map<string, { title: string; rows: Row[] }>();

  for (const publication of publications) {
    const title = nl
      ? publication.titleNl
      : publication.titleEn || publication.titleNl;
    const group = groups.get(publication.kind) ?? { title, rows: [] };
    group.rows.push({
      id: publication.id,
      label: nl ? publication.issueNl : publication.issueEn || publication.issueNl,
      // Hetzelfde adres als de tracker verstuurt; die functie is de enige bron,
      // zodat meten en tonen niet uit elkaar kunnen lopen.
      views: views[magazineViewUrl(publication)] ?? 0,
      downloads: downloads[publication.id] ?? 0,
    });
    groups.set(publication.kind, group);
  }

  return [...groups.entries()].map(([kind, group]) => ({
    kind,
    title: group.title,
    rows: group.rows,
    total: group.rows.reduce((sum, row) => sum + row.views, 0),
    max: Math.max(1, ...group.rows.map((row) => row.views)),
  }));
}

function share(views: number, max: number): number {
  return Math.round((views / max) * 100);
}

function formatNumber(value: number, nl: boolean): string {
  return new Intl.NumberFormat(nl ? "nl-BE" : "en-GB").format(value);
}

function formatDate(value: Date, nl: boolean): string {
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}
