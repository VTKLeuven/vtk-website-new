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
 */
export function RewardCoins({
  amount,
  label,
  size,
}: {
  amount: number;
  label: string;
  size?: 'sm';
}) {
  return (
    <span className="vtk-reward" data-size={size} role="img" title={label} aria-label={label}>
      {amount}
      <span className="vtk-reward-coins" aria-hidden="true">
        <span className="vtk-reward-coin vtk-reward-coin-back" />
        <span className="vtk-reward-coin vtk-reward-coin-face" />
      </span>
    </span>
  );
}
