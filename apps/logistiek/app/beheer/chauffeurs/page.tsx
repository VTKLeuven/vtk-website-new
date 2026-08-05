import { requireManage } from '@/lib/session';
import { driverPool } from '@/lib/uitleen-server';
import { DriverList } from './driver-list';
import { DriverPicker } from './driver-picker';

export default async function BeheerChauffeursPage() {
  await requireManage();
  const drivers = await driverPool();

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Chauffeurs</h2>
      <p className="mt-1 text-sm text-vtk-muted">
        Wie hier staat, kan je bij een rit als chauffeur kiezen. Een toegevoegde chauffeur ziet enkel zijn
        eigen ritten, geen beheer.
      </p>

      <div className="mt-5">
        <DriverList drivers={drivers} />
      </div>

      <details className="mt-5 rounded-[14px] border border-dashed border-vtk-navy/25 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">+ Chauffeur toevoegen</summary>
        <div className="mt-3">
          <DriverPicker />
        </div>
      </details>
    </section>
  );
}
