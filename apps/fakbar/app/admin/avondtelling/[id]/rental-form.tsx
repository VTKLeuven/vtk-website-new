'use client';

import { useState } from 'react';
import { Input, Label } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { saveEveningRentalAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import { formatEuro } from '@/lib/fakbar-format';

type Rental = { rentalFee: number; expectedRevenue: number; effectiveProfit: number } | null;

function euroValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * De verhuurafrekening van een avond, apart van de telling: het is een andere
 * handeling op een ander moment (na de factuur, niet aan de toog), en het hoort
 * niet elke avond ingevuld te worden.
 */
export function EveningRentalForm({ eveningId, rental }: { eveningId: string; rental: Rental }) {
  const [open, setOpen] = useState(rental !== null);
  const [fee, setFee] = useState(euroValue(rental?.rentalFee ?? 25000));
  const [expected, setExpected] = useState(euroValue(rental?.expectedRevenue ?? 0));
  const [profit, setProfit] = useState(euroValue(rental?.effectiveProfit ?? 0));

  const cents = (value: string) => Math.round((Number(value.replace(',', '.')) || 0) * 100);
  const invoice = cents(fee) + cents(profit);

  if (!open) {
    return (
      <section className="fakbar-card">
        <h3 className="text-base font-semibold text-[var(--ink)]">Verhuur</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Was deze avond afgehuurd door een vereniging, dan hoort daar een aparte afrekening bij.
        </p>
        <button type="button" className="fakbar-btn fakbar-btn-ghost mt-4" onClick={() => setOpen(true)}>
          Verhuur toevoegen
        </button>
      </section>
    );
  }

  return (
    <SaveForm
      action={saveEveningRentalAction}
      submitLabel="Verhuur opslaan"
      savingLabel="Opslaan…"
      savedMessage="Verhuur opgeslagen."
      errorMessages={saveMessages}
      className="fakbar-card space-y-4"
    >
      <input type="hidden" name="eveningId" value={eveningId} />
      <div>
        <h3 className="text-base font-semibold text-[var(--ink)]">Verhuur</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">Bedragen in euro, zoals ze op de eindfactuur komen.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="rentalFee">Huurprijs</Label>
          <Input id="rentalFee" name="rentalFee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="expectedRevenue">Verwachte omzet</Label>
          <Input
            id="expectedRevenue"
            name="expectedRevenue"
            inputMode="decimal"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="effectiveProfit">Effectieve winst</Label>
          <Input
            id="effectiveProfit"
            name="effectiveProfit"
            inputMode="decimal"
            value={profit}
            onChange={(e) => setProfit(e.target.value)}
          />
        </div>
      </div>

      <p className="border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">
        Op de factuur <strong className="ml-1 tabular-nums text-[var(--ink)]">{formatEuro(invoice)}</strong>
        <span className="ml-1">(huurprijs plus effectieve winst)</span>
      </p>
    </SaveForm>
  );
}
