import Link from 'next/link';

/**
 * Sorteren in het beheer: de pijl, de pil en de vergelijkers.
 *
 * **Bewust geen `'use client'`.** Het beheer sorteert op twee manieren, en dat
 * verschil is echt: een tabel die de client al volledig in handen heeft
 * (inventaris, flesserke, chauffeurs) sorteert in `useState`, terwijl een
 * server-gerenderde lijst (aanvragen, evenementen, vervoer) de sleutel en de
 * richting uit de query haalt zodat een gesorteerde lijst deelbaar blijft en de
 * terugknop werkt. In een client-module wordt élke export een client-referentie,
 * en dan kan een server-component `compareText` niet meer aanroepen.
 *
 * Wat hier staat, is daarom enkel wat beide kanten delen: hoe een sorteerpil
 * eruitziet, welke pijl erbij hoort, en hoe je op tekst vergelijkt. De
 * client-only kant (`useSort`, `SortHeader`, `SortChips`) staat in
 * `sortable-header.tsx` en gebruikt precies dezelfde stukken.
 *
 * **Elke sortering werkt in twee richtingen.** Een tweede klik op dezelfde
 * sleutel draait om. Dat gold overal behalve op /beheer/evenementen, waar je op
 * naam of post enkel oplopend kon; "wie vroeg er het laatst iets aan" was er dus
 * niet te zien zonder tot onderaan te scrollen.
 */

export type SortDir = 'asc' | 'desc';

export function compareText(a: string, b: string, dir: SortDir): number {
  return a.localeCompare(b, 'nl', { sensitivity: 'base' }) * (dir === 'asc' ? 1 : -1);
}

/**
 * De richting na een klik op `key`.
 *
 * Een andere sleutel begint bij haar eigen standaard (een datum leest meestal
 * van nieuw naar oud, een naam van a naar z); dezelfde sleutel draait om. Zonder
 * die eerste regel begint elke datumkolom bij het oudste item van 2019.
 */
export function nextSortDir(
  key: string,
  activeKey: string | null,
  activeDir: SortDir,
  defaultDir: SortDir = 'asc'
): SortDir {
  if (key !== activeKey) return defaultDir;
  return activeDir === 'asc' ? 'desc' : 'asc';
}

/** De pil van een sorteerknop, actief of niet. Eén plek, zodat ze overal gelijk is. */
export function sortChipClass(active: boolean): string {
  return active
    ? 'inline-flex items-center gap-1 rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1 font-semibold text-white'
    : 'inline-flex items-center gap-1 rounded-full border border-vtk-navy/15 px-3 py-1 font-medium text-vtk-ink transition hover:border-vtk-navy/40';
}

/**
 * De pijl achter een actieve sorteerknop, plus wat een screenreader hoort.
 *
 * Een pijl alleen is geen richting: "Naam ↑" leest voor als "Naam", en dan is
 * oplopend niet van aflopend te onderscheiden.
 */
export function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <>
      <span aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span>
      <span className="sr-only">{dir === 'asc' ? '(oplopend)' : '(aflopend)'}</span>
    </>
  );
}

export type SortLinkOption<K extends string> = {
  key: K;
  label: string;
  /** Waar deze knop heen gaat; de pagina rekent de volgende richting zelf uit. */
  href: string;
};

/**
 * Een rij sorteerknoppen voor een **server-gerenderde** lijst.
 *
 * Links en geen knoppen: de sortering staat in de query, dus is elke keuze een
 * gewone navigatie. Daarom ook geen callback-prop; die kan de servergrens niet
 * over, en de hrefs staan al klaar.
 */
export function SortChipLinks<K extends string>({
  options,
  activeKey,
  dir,
  label = 'Sorteren op',
}: {
  options: ReadonlyArray<SortLinkOption<K>>;
  /** `null` = nog niets gekozen; dan staat er geen pil aan. */
  activeKey: K | null;
  dir: SortDir;
  label?: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Sorteren">
      <span className="text-vtk-muted">{label}</span>
      {options.map((option) => {
        const active = activeKey === option.key;
        return (
          <Link
            key={option.key}
            href={option.href}
            aria-current={active ? 'true' : undefined}
            className={sortChipClass(active)}
          >
            {option.label}
            <SortIndicator active={active} dir={dir} />
          </Link>
        );
      })}
    </nav>
  );
}
