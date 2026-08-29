import type { Metadata } from 'next';
import { HoursForm } from './hours-form';
import { getElixirHours } from '@/lib/opening-hours';

export const metadata: Metadata = { title: 'Openingsuren' };

export default async function OpeningsurenBeheerPage() {
  const hours = await getElixirHours();

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Openingsuren</h2>
        <p>
          Dit zijn dezelfde uren als op de openingsurenband op de homepage van vtk.be: het is één rij in de databank,
          geen kopie. Wijzig je ze hier, dan wijzigen ze daar mee. Laat een dag leeg om ze als gesloten te tonen.
        </p>
      </div>

      <HoursForm hours={hours} />
    </div>
  );
}
