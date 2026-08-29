import type { Metadata } from 'next';
import { RentalSettingsForm } from './rental-settings-form';
import { getRentalSettings } from '@/lib/rental-settings';

export const metadata: Metadata = { title: 'Verhuur' };

export default async function VerhuurBeheerPage() {
  const rental = await getRentalSettings();

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Verhuurvoorwaarden</h2>
        <p>
          Wat er op de publieke pagina /verhuur staat. Het tarief stond hiervoor hardgecodeerd in twee bestanden, met
          het academiejaar erbij; nu wijzig je het hier.
        </p>
      </div>

      <RentalSettingsForm settings={rental} />
    </div>
  );
}
