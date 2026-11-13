import { money, signedMoney } from './format';

/*
 * Een bedrag in het budget. Wat negatief is, staat altijd met een min en in
 * het rood: een kost, een verlies, minder dan begroot. Zo lees je zonder de
 * kolomkop of iets geld kost of opbrengt.
 *
 * `cost` draait het teken om: de site rekent een kost als een positief getal
 * (aantal × prijs), maar toont ze als wat ze met het totaal doet.
 */
export function Money({
  value,
  nl = true,
  cost = false,
  signed = false,
  className,
}: {
  value: number | null | undefined;
  nl?: boolean;
  cost?: boolean;
  /** Met een plusteken bij winst: voor een verschil. */
  signed?: boolean;
  className?: string;
}) {
  if (value == null || Number.isNaN(value)) return <span className={className}>–</span>;
  const v = cost ? -value : value;
  // −0,00 bestaat niet: een kost van nul is gewoon 0,00.
  const shown = Math.abs(v) < 0.005 ? 0 : v;
  const tone = shown < 0 ? 'neg' : signed && shown > 0 ? 'pos' : '';
  return (
    <span className={[className, tone].filter(Boolean).join(' ') || undefined}>
      {signed ? signedMoney(shown, nl) : money(shown, nl)}
    </span>
  );
}
