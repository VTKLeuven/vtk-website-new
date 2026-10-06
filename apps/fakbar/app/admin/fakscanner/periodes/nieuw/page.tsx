import type { Metadata } from 'next';
import Link from 'next/link';
import { DEFAULT_FAK_PERIOD_RULES } from '@vtk/db/fakscanner';
import { ElixirIcon } from '@/components/elixir-icon';
import { FakPeriodForm } from '@/components/fakscanner/period-form';
import { getFakscannerConfig } from '@/lib/fakscanner-admin';

export const metadata: Metadata = { title: 'Nieuwe periode · Fakscanner' };

/**
 * Een nieuwe periode. Begin en einde staan bewust leeg: een voorgestelde datum
 * die iemand vergeet aan te passen, zet de scanner op het verkeerde moment om.
 * De pintregel start van de gewone instelling, zodat "niets aanpassen" betekent
 * "zoals altijd".
 */
export default async function NewFakPeriodPage() {
  const config = await getFakscannerConfig();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/fakscanner/periodes" className="fakbar-breadcrumb !text-[var(--muted)]">
          <ElixirIcon name="chevron" className="h-3.5 w-3.5 rotate-90" />
          Periodes
        </Link>
        <div className="fakbar-section-head mt-1">
          <h2>Nieuwe periode</h2>
          <p>De lezer volgt deze regels vanaf het begin; je kan ze tot het einde nog aanpassen.</p>
        </div>
      </div>

      <FakPeriodForm
        values={{
          name: '',
          startsAt: '',
          endsAt: '',
          windowEnabled: true,
          windowStart: DEFAULT_FAK_PERIOD_RULES.windowStart,
          windowEnd: DEFAULT_FAK_PERIOD_RULES.windowEnd,
          intervalMinutes: DEFAULT_FAK_PERIOD_RULES.intervalMinutes,
          rewardEnabled: DEFAULT_FAK_PERIOD_RULES.rewardEnabled,
          rewardEvery: config.rewardEvery,
        }}
      />
    </div>
  );
}
