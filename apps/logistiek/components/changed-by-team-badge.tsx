/**
 * "Gewijzigd t.o.v. aanvraag" (F6.11): het team paste de uren, het voertuig of
 * iets anders aan voor of bij het goedkeuren.
 *
 * Voor het team zelf: wie een week plant, wil zien welke ritten niet meer zijn
 * wat de aanvrager vroeg, want die persoon leest het ook in zijn mail. De
 * wijzigingen zelf staan in de tooltip; de aanvrager leest ze uitgeschreven op
 * zijn eigen scherm.
 */
export function ChangedByTeamBadge({ lines }: { lines?: string[] }) {
  if (!lines || lines.length === 0) return null;
  return (
    <span
      title={lines.join('\n')}
      className="rounded-full bg-vtk-yellow px-2 py-0.5 text-[11px] font-semibold text-vtk-on-yellow"
    >
      Gewijzigd t.o.v. aanvraag
    </span>
  );
}
