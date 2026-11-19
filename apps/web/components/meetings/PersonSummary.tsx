import type { PersonEntry } from "./meetingPeople";

/**
 * Eén persoon zoals in "Per persoon" › "Twee kolommen": de naam vet, daaronder
 * het broodje en het drankje. De kaart op de pagina en het uitdeelscherm tonen
 * allebei deze regel, zodat ze nooit uit elkaar lopen.
 *
 * Er staat geen vaste lettergrootte in: de regel neemt die van zijn ouder over
 * (`text-sm` op de pagina, de berekende maat in het uitdeelscherm).
 */
export function PersonSummary({ nl, entry }: { nl: boolean; entry: PersonEntry }) {
  const row = entry.reservation;
  return (
    <>
      <span className="block font-semibold text-vtk-ink">{entry.name}</span>
      {row && (
        <span className={`block ${row.invalid ? "text-red-600" : "text-[#34405e]"}`}>
          {row.hasOrder ? (
            <>
              {row.item ?? (nl ? "geen broodje" : "no sandwich")}
              {row.external && (nl ? " (extern)" : " (external)")}
              {row.extra && (nl ? " (bureauvoorraad)" : " (bureau stock)")}
              {row.drink ? ` · ${row.drink}` : ""}
              {row.invalid && (nl ? " (ongeldig)" : " (invalid)")}
            </>
          ) : (
            <span className="text-[#5c667f]">{nl ? "komt zonder bestelling" : "coming without an order"}</span>
          )}
        </span>
      )}
      {entry.theokot.map((order) => (
        <span key={order.id} className="block text-[#34405e]">
          {order.items}
          <span className="text-[#5c667f]">{nl ? " (zelf bij Theokot)" : " (ordered at Theokot)"}</span>
        </span>
      ))}
      {row?.comment && <span className="block text-[0.86em] text-[#5c667f]">“{row.comment}”</span>}
    </>
  );
}
