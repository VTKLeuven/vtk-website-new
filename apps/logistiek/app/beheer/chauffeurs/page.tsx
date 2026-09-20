import { requireManage } from '@/lib/session';
import { driverPool, driversPerGroup } from '@/lib/uitleen-server';
import { DriverList } from './driver-list';
import { DriverPicker } from './driver-picker';
import { GroupDriverList } from './group-drivers';
import { PhoneImport } from './phone-import';

export default async function BeheerChauffeursPage() {
  await requireManage();
  const [drivers, groups] = await Promise.all([driverPool(), driversPerGroup()]);

  return (
    <div className="logistics-form-width grid gap-6">
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

      {/* De gedeelde gsm-lijst (F4.3). Onder de chauffeurslijst, want het is
          dezelfde lijst: dit vult er enkel de telefoonkolom van. */}
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Nummers uit de gsm-lijst</h2>
        <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
          Exporteer de gedeelde contacten van het praesidium als .vcf en kies het bestand hieronder.
          Je krijgt een nakijklijst: per chauffeur wat er nu staat en wat de lijst voorstelt. Het
          bestand blijft in je browser, enkel wat je aanvinkt wordt opgeslagen.
        </p>

        <div className="mt-5">
          <PhoneImport drivers={drivers} />
        </div>
      </section>

      {/* De doorsnede per post (F4.10), onder de lijst zelf: ze leest die lijst,
          ze vervangt hem niet. */}
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Per post en werkgroep</h2>
        <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
          Geef je een rit door aan een post, dan kiest die post een chauffeur uit haar eigen leden die
          hierboven in de chauffeurslijst staan. Hieronder staat per post wie dat zijn. Iemand toevoegen
          zet hem in diezelfde ene lijst: hij is daarna ook bij de andere posten kiesbaar en ziet zijn
          ritten onder &quot;Mijn ritten&quot;. Wie in welke post zit, beheer je op vtk.be.
        </p>

        <div className="mt-5">
          <GroupDriverList groups={groups} />
        </div>
      </section>
    </div>
  );
}
