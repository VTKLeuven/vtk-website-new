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
      <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
        Wie hier staat, kan je bij een rit als chauffeur kiezen. De lijst is de post Logistiek van dit
        werkingsjaar plus wie je hieronder toevoegt. Iemand toevoegen geeft géén beheerrechten: die persoon
        ziet enkel zijn eigen ritten onder &quot;Mijn ritten&quot;. De voertuigen zelf beheer je bij
        Instellingen.
      </p>

      {/* Toevoegen bovenaan en open: de vraag "waar voeg ik een chauffeur toe"
          kwam uit de feedback, en het stond onderaan achter een uitklapper. */}
      <div className="mt-5 rounded-[14px] border border-dashed border-vtk-navy/25 p-4">
        <p className="text-sm font-semibold text-vtk-ink">Chauffeur toevoegen</p>
        <p className="mt-1 text-xs text-vtk-muted">
          Zoek een lid van vtk.be; zo weet de app wie er straks &quot;Mijn ritten&quot; te zien krijgt.
        </p>
        <div className="mt-3">
          <DriverPicker />
        </div>
      </div>

      <div className="mt-6">
        <DriverList drivers={drivers} />
      </div>
    </section>
  );
}
