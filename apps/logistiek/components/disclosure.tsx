import type { ReactNode } from 'react';
import { LogisticsIcon } from '@/components/logistics-icon';

const VARIANTS = {
  card: {
    box: 'rounded-[18px] border border-vtk-navy/10 bg-vtk-surface',
    summary: 'rounded-[18px] p-5 sm:px-6',
    title: 'text-lg font-semibold tracking-tight text-vtk-ink',
    body: 'px-5 pb-5 sm:px-6 sm:pb-6',
  },
  row: {
    box: 'rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50',
    summary: 'rounded-[14px] px-4 py-3',
    title: 'font-semibold text-vtk-ink',
    body: 'px-4 pb-4',
  },
  plain: {
    box: '',
    summary: 'rounded-[10px] py-1',
    title: 'text-sm font-semibold text-vtk-ink',
    body: 'pt-2',
  },
} as const;

/**
 * Een blok dat dichtklapt, met een kop die zegt wat erin zit (M4 uit de audit
 * van november 2026).
 *
 * Zoals `AdminDisclosure` op vtk.be: standaard dicht, de kop met de naam en een
 * korte samenvatting blijft staan, de velden komen pas na een klik. Open was de
 * pagina met instellingen op een telefoon zes schermen formulieren, waarin je
 * het ene veld dat je zocht niet meer terugvond.
 *
 * Een native `<details>`: het werkt zonder JavaScript, en een formulier erin
 * blijft een gewoon formulier. Zet de verzendknop mee in het blok, zodat een
 * veld dat de browser afkeurt nooit in een dichtgeklapt blok verstopt zit.
 *
 * `card` is een blok op de pagina, `row` een item binnen een kaart: een kaart in
 * een kaart is wat de huisstijl vermijdt. `plain` is een tussenkop binnen een
 * kaart die zelf een lijst van rijen draagt, zonder rand eromheen.
 */
export function Disclosure({
  title,
  summary,
  open = false,
  variant = 'card',
  children,
}: {
  title: ReactNode;
  /** Eén regel met wat er nu ingesteld is, zodat je niet hoeft open te klikken om het te weten. */
  summary?: ReactNode;
  /** Open bij het laden: wat leeg is of wat je net aanmaakte. */
  open?: boolean;
  variant?: 'card' | 'row' | 'plain';
  children: ReactNode;
}) {
  const style = VARIANTS[variant];
  const Heading = variant === 'card' ? 'h2' : 'h3';
  return (
    <details open={open} className={`group ${style.box}`}>
      <summary
        className={`flex min-h-10 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden ${style.summary}`}
      >
        <span className="min-w-0 flex-1">
          <Heading className={style.title}>{title}</Heading>
          {summary ? <span className="mt-0.5 block text-sm text-vtk-muted">{summary}</span> : null}
        </span>
        <LogisticsIcon
          name="chevron"
          className="h-5 w-5 shrink-0 text-vtk-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className={style.body}>{children}</div>
    </details>
  );
}
