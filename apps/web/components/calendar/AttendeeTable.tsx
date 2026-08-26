import type { AttendeeRow } from "@/lib/calendar/interest";

/**
 * Wie er naar een alumni-evenement komt.
 *
 * Publiek zichtbaar, en dat is de bedoeling: de hele reden dat dit bestaat, is
 * dat een alumnus wil weten of hij er iemand gaat kennen voor hij beslist te
 * komen. Alleen wie zelf een vakje aanvinkte staat erin.
 *
 * Drie gelabelde kolommen en geen opsomming met middots: "Jan Peeters · 2019 ·
 * VTK" is één regel waar drie verschillende dingen in staan, en op een telefoon
 * wordt dat een woordsalade. Onder de smalle grens worden de kolomkoppen labels
 * per waarde (zie vtk-event.css).
 */
export function AttendeeTable({
  rows,
  locale,
}: {
  rows: AttendeeRow[];
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  if (rows.length === 0) return null;

  const anonymous = nl ? "Anoniem" : "Anonymous";

  return (
    <section className="vtk-attendees">
      <div className="vtk-attendees-head">
        <h2>{nl ? "Wie er komt" : "Who is coming"}</h2>
        <p>
          {nl
            ? "Alleen wie zelf aangaf zichtbaar te willen zijn. De teller hierboven telt iedereen."
            : "Only those who chose to be visible. The counter above counts everyone."}
        </p>
      </div>
      <div className="vtk-attendees-scroll">
        <table className="vtk-attendees-table">
          <thead>
            <tr>
              <th scope="col">{nl ? "Naam" : "Name"}</th>
              <th scope="col">{nl ? "Afgestudeerd" : "Graduated"}</th>
              <th scope="col">{nl ? "In VTK gezeten" : "Was in VTK"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td data-label={nl ? "Naam" : "Name"}>
                  {row.name ?? <span className="vtk-attendees-anon">{anonymous}</span>}
                </td>
                <td data-label={nl ? "Afgestudeerd" : "Graduated"}>
                  {row.graduationYear ?? "—"}
                </td>
                <td data-label={nl ? "In VTK gezeten" : "Was in VTK"}>
                  {row.wasInVtk ? (nl ? "Ja" : "Yes") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
