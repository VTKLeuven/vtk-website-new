import { savePublicCopyAction } from '@/app/actions/public-copy';
import { SaveForm } from '@/components/ui/save-form';
import {
  getPublicCopyByLocale,
  PUBLIC_COPY_MAX_LENGTH,
  type PublicCopyKey,
} from '@/lib/public-copy';
import { requireManage } from '@/lib/session';

const SECTIONS: Array<{
  title: string;
  description: string;
  fields: Array<{ key: PublicCopyKey; label: string; rows?: number }>;
}> = [
  {
    title: 'Algemeen',
    description: 'Teksten die op meerdere plaatsen of buiten de inhoudspagina’s staan.',
    fields: [
      { key: 'loginLead', label: 'Uitleg bij inloggen', rows: 2 },
      { key: 'footerLead', label: 'Footer', rows: 2 },
    ],
  },
  {
    title: 'Homepage',
    description: 'Uitleg in de hero, de drie kaarten en het stappenoverzicht.',
    fields: [
      { key: 'homeLead', label: 'Intro', rows: 2 },
      { key: 'homeMaterialLead', label: 'Kaart Materiaal', rows: 2 },
      { key: 'homeVanLead', label: 'Kaart Camionette', rows: 2 },
      { key: 'homeReservationsLead', label: 'Kaart Mijn aanvragen', rows: 2 },
      { key: 'stepChoose', label: 'Stap 1' },
      { key: 'stepRequest', label: 'Stap 2' },
      { key: 'stepReturn', label: 'Stap 3' },
      { key: 'infoTitle', label: 'Titel informatieband', rows: 2 },
      { key: 'infoLead', label: 'Tekst informatieband', rows: 3 },
    ],
  },
  {
    title: 'Materiaal',
    description: 'Uitleg boven en naast de materiaalcatalogus.',
    fields: [
      { key: 'pageMaterialLead', label: 'Intro catalogus', rows: 3 },
      { key: 'materialPaymentNote', label: 'Uitleg betaling en waarborg', rows: 3 },
    ],
  },
  {
    title: 'Camionette',
    description: 'Uitleg boven het formulier en in het blok Praktische informatie.',
    fields: [
      { key: 'pageVanLead', label: 'Intro aanvraag', rows: 3 },
      { key: 'vanDriverInfo', label: 'Chauffeur en helpers', rows: 2 },
      { key: 'vanTimingInfo', label: 'Aanvraagtermijn', rows: 2 },
      { key: 'vanPaymentInfo', label: 'Goedkeuring en betaling', rows: 2 },
    ],
  },
];

const textareaClass =
  'min-h-20 w-full resize-y rounded-[10px] border border-vtk-navy/15 bg-white px-3 py-2 text-sm leading-6 text-vtk-ink';

export default async function BeheerTekstenPage() {
  await requireManage();
  const content = await getPublicCopyByLocale();

  return (
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <p className="text-sm text-vtk-muted">Frontend</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">
          Teksten
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-vtk-body">
          Pas hier de informatieve teksten van de publieke uitleendienst aan. Knoppen,
          paginatitels, statussen en foutmeldingen blijven vaste interface-elementen.
        </p>
      </section>

      <SaveForm
        action={savePublicCopyAction}
        submitLabel="Teksten opslaan"
        savingLabel="Opslaan..."
        savedMessage="Teksten opgeslagen."
        errorMessages={{
          TEXT_TOO_LONG: `Een tekst mag maximaal ${PUBLIC_COPY_MAX_LENGTH} tekens bevatten.`,
        }}
        className="grid gap-6"
      >
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6"
          >
            <h3 className="text-lg font-semibold tracking-tight text-vtk-ink">
              {section.title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-vtk-muted">{section.description}</p>

            <div className="mt-5 grid gap-5">
              {section.fields.map((field) => (
                <fieldset key={field.key}>
                  <legend className="mb-2 text-sm font-semibold text-vtk-ink">
                    {field.label}
                  </legend>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(['nl', 'en'] as const).map((locale) => (
                      <label key={locale} className="grid gap-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
                          {locale}
                        </span>
                        <textarea
                          name={`${locale}.${field.key}`}
                          defaultValue={content[locale][field.key]}
                          rows={field.rows ?? 1}
                          maxLength={PUBLIC_COPY_MAX_LENGTH}
                          className={textareaClass}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </section>
        ))}
      </SaveForm>
    </div>
  );
}
