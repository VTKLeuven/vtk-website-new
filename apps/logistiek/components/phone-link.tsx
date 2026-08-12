/**
 * Telefoonnummer als `tel:`-link. Een chauffeur die onderweg is, wil tikken en
 * bellen, niet overtypen. De spaties en punten uit het ingevoerde nummer gaan
 * uit de href; wat er staat, blijft staan zoals het lid het invulde.
 */
export function PhoneLink({ number }: { number: string }) {
  const dialable = number.replace(/[^\d+]/g, '');
  return (
    <a href={`tel:${dialable}`} className="underline decoration-vtk-yellow underline-offset-2">
      {number}
    </a>
  );
}
