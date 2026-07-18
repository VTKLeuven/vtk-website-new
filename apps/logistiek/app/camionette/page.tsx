import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { copy, getLocale } from '@/lib/i18n';
import { formatEuro, VAN_HOURLY_RATE_CENTS } from '@/lib/uitleen';
import { VanRequestForm } from './request-form';

export default async function CamionettePage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate message="Log in met je VTK-account om de camionette te reserveren." />;
  }

  return (
    <PageShell
      title={
        <>
          {t.pageVanTitle} <em className="font-serif font-normal italic text-vtk-navy">{t.pageVanAccent}</em>
        </>
      }
      intro={t.pageVanLead}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <VanRequestForm locale={locale} />

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Goed om te weten</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-vtk-body">
            <li>
              <strong className="text-vtk-ink">{formatEuro(VAN_HOURLY_RATE_CENTS)} per uur</strong>,
              met {formatEuro(VAN_HOURLY_RATE_CENTS)} als minimum. Elk begonnen uur telt.
            </li>
            <li>Een VTK-vrijwilliger rijdt en 1 à 2 personen rijden mee om te helpen.</li>
            <li>Vraag minstens twee weken op voorhand aan; VTK-evenementen hebben voorrang.</li>
            <li>Na goedkeuring wijst het team een chauffeur toe en betaal je online of ter plaatse.</li>
          </ul>
        </aside>
      </div>
    </PageShell>
  );
}
