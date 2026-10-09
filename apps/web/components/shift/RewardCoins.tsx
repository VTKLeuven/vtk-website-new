import './shift-board.css';

/**
 * De beloning van een shift: het aantal bonnen als cijfer, met muntjes ernaast.
 *
 * Eén tekening voor de hele site: de shiftkaartjes op de homepage
 * (`FrontpageShiftBand`) en de agenda op /shift laden allebei `shift-board.css`
 * en gebruiken allebei dit component. Daar stonden een muntje en een
 * ticket-icoontje naast elkaar voor precies hetzelfde ding.
 *
 * `size="sm"` is de maat voor een metaregel, waar de bonnen tussen tekst van
 * 12,5 px staan in plaats van naast het uur van een kaartje.
 * `size="lg"` is het totaal bovenaan /shift/history, naast de titel.
 *
 * `withheld` tekent ze grijs: de shift is ze waard, maar deze kijker verdient ze
 * niet (praesidiumjaar). Weglaten zou zeggen dat de shift niemand iets oplevert.
 */
export function RewardCoins({
  amount,
  label,
  size,
  withheld = false,
}: {
  amount: number;
  label: string;
  size?: 'sm' | 'lg';
  withheld?: boolean;
}) {
  return (
    <span
      className="vtk-reward"
      data-size={size}
      data-withheld={withheld || undefined}
      role="img"
      title={label}
      aria-label={label}
    >
      {amount}
      <span className="vtk-reward-coins" aria-hidden="true">
        <span className="vtk-reward-coin vtk-reward-coin-back" />
        <span className="vtk-reward-coin vtk-reward-coin-face" />
      </span>
    </span>
  );
}
