import type { ReactNode } from 'react';

/**
 * Vaste, in-huis getekende SVG-iconen per categorie. Gebruikt als nette default
 * wanneer een catalogusitem (nog) geen foto heeft; matcht op trefwoorden in de
 * categorienaam zodat het blijft werken als het team categorieën hernoemt. Alles
 * navy in de app-stijl; onbekende categorieën vallen terug op een doos.
 */

type IconKey =
  | 'tools'
  | 'deco'
  | 'sound'
  | 'cook'
  | 'power'
  | 'drink'
  | 'safety'
  | 'clean'
  | 'rope'
  | 'doc'
  | 'flag'
  | 'cantus'
  | 'clothing'
  | 'grid'
  | 'box';

function iconFor(categoryName: string | null | undefined): IconKey {
  const n = (categoryName ?? '').toLowerCase();
  if (/werk|gereedschap|tool/.test(n)) return 'tools';
  if (/decor/.test(n)) return 'deco';
  if (/licht|geluid|sound|light|audio/.test(n)) return 'sound';
  if (/kook|keuken|cook|kitchen/.test(n)) return 'cook';
  if (/elek|stroom|power|kabel/.test(n)) return 'power';
  if (/drank|drink|glaz|beker|bar\b/.test(n)) return 'drink';
  if (/veilig|signal|safety/.test(n)) return 'safety';
  if (/kuis|schoonmaak|clean|poets/.test(n)) return 'clean';
  if (/touw|tape|rope|koord/.test(n)) return 'rope';
  if (/secri|secret|kantoor|papier|doc|admin/.test(n)) return 'doc';
  if (/banner|vlag|flag/.test(n)) return 'flag';
  if (/cantus|bier|beer|pint/.test(n)) return 'cantus';
  if (/kled|kledij|shirt|cloth|textiel/.test(n)) return 'clothing';
  if (/allerlei|divers|misc|varia/.test(n)) return 'grid';
  return 'box';
}

const PATHS: Record<IconKey, ReactNode> = {
  tools: (
    <path d="M14.6 5.4a3.5 3.5 0 0 0-4.5 4.5L4 16v4h4l6.1-6.1a3.5 3.5 0 0 0 4.5-4.5l-2.3 2.3-2-.3-.3-2 2.6-2.3z" />
  ),
  deco: (
    <>
      <path d="M12 3.2l1.9 4.9 4.9 1.9-4.9 1.9L12 16.8l-1.9-4.9L5.2 10l4.9-1.9z" />
      <path d="M18.3 15l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h3l4.5-3.5v12L7 14.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  cook: (
    <>
      <path d="M5 10.5h14V15a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M3 12h2M19 12h2" />
      <path d="M8 10.5V9.5a4 4 0 0 1 8 0v1" />
    </>
  ),
  power: <path d="M13 3l-7.5 10H11l-1 8 8.5-10.5H12l1-7.5z" />,
  drink: (
    <>
      <path d="M6.5 4.5h11l-1.1 13.2a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8z" />
      <path d="M7 9.5h10" />
    </>
  ),
  safety: (
    <>
      <path d="M12 4.5 2.8 20h18.4z" />
      <path d="M12 10.5v4" />
      <path d="M12 17.3h.01" />
    </>
  ),
  clean: (
    <>
      <path d="M10 9h4v9.5a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M10 9V6.5h-2.5" />
      <path d="M7.5 6.5 5 5" />
      <path d="M5.2 8h-1.2M4.6 5.4l-.8-.8M6 4.4V3.2" />
    </>
  ),
  rope: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3.5h7l3.5 3.5V20.5H7z" />
      <path d="M13.5 3.5V8H18" />
      <path d="M9.5 9.5h3M9.5 12.5h6M9.5 15.5h6" />
    </>
  ),
  flag: (
    <>
      <path d="M6 4.5v15.5" />
      <path d="M6 5h11l-2.2 3.2L17 11.5H6z" />
    </>
  ),
  cantus: (
    <>
      <path d="M8 8h6.5v10a1.5 1.5 0 0 1-1.5 1.5H9.5A1.5 1.5 0 0 1 8 18z" />
      <path d="M14.5 10.5h2A1.5 1.5 0 0 1 18 12v2a1.5 1.5 0 0 1-1.5 1.5h-2" />
      <path d="M8 11h6.5" />
    </>
  ),
  clothing: (
    <path d="M8.6 4 5 6.6l2 3 1.6-1.1V20h6.8V8.5l1.6 1.1 2-3L15.4 4a3.4 3.4 0 0 1-6.8 0z" />
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </>
  ),
  box: (
    <>
      <path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9z" />
      <path d="M4 7.5 12 11.5 20 7.5" />
      <path d="M12 11.5V20.5" />
    </>
  ),
};

/** Vult de foto-plek van een item met het categorie-icoon op een paper-2 vlak. */
export function CategoryThumb({
  categoryName,
  className,
}: {
  categoryName?: string | null;
  className?: string;
}) {
  return (
    <div className={`grid h-full w-full place-items-center bg-vtk-paper-2 ${className ?? ''}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[38%] max-h-16 min-h-9 w-auto text-vtk-navy/30"
        aria-hidden
      >
        {PATHS[iconFor(categoryName)]}
      </svg>
    </div>
  );
}
