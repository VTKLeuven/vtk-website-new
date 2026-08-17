import { prisma } from '@vtk/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { utcToLocalDateTime } from '@/lib/ticketing/time';
import type { Locale } from '@vtk/i18n';
import { ShiftTemplateBuilder, type ShiftTemplate } from './ShiftTemplateBuilder';

// -----------------------------------------------------------------------------
// De sjablonen zelf.
//
// Evenementen die telkens terugkeren (een cantus, een bar-avond, een TD) hebben
// elke keer dezelfde reeks shiften; enkel datum, uur en soms de locatie
// verschillen. Zet zo'n reeks hier één keer neer en de rest van deze pagina doet
// het rekenwerk.
//
// Een sjabloon toevoegen = een blok in deze lijst bijzetten. Er is bewust geen
// beheerscherm voor: dit verandert hooguit een paar keer per werkingsjaar, en
// een lijst in de code is dan makkelijker te lezen (en te reviewen) dan een
// tabel in de databank.
//
//   startOffsetMinutes  minuten t.o.v. het startmoment dat je bovenaan invult;
//                       negatief = ervoor (opbouw), 0 = de eerste shift.
//   durationMinutes     lengte van de shift.
//   maxParticipants     aantal plaatsen.
//   reward              aantal bonnetjes per deelnemer, per shift te zetten: een
//                       opbouw van een half uur is niet hetzelfde waard als vier
//                       uur aan de tap.
//   location / post     vaste locatie/post voor deze ene shift: ze volgt de
//                       globale locatie/post bovenaan dan niet meer. Bv.
//                       "Bijrijden" vertrekt altijd aan de loods, waar de cantus
//                       zelf ook doorgaat. Weglaten = mee met het globale veld.
//                       In het scherm blijft ze gewoon aanpasbaar.
//   enabled: false      staat standaard uitgevinkt (bv. een shift die je enkel
//                       bij een grote editie nodig hebt).
// -----------------------------------------------------------------------------

const SHIFT_TEMPLATES: ShiftTemplate[] = [
  {
    id: 'cantus',
    label: 'Cantus',
    note: 'Klassieke cantus: opbouw, inkom, bar en tap, afbouw achteraf.',
    defaults: {
      eventName: 'Cantus',
      location: 'Waaiberg',
      post: 'ACTIVITEITEN',
      timeOfDay: '20:30',
    },
    shifts: [
      {
        key: 'bijrijden-1',
        name: 'Bijrijden',
        startOffsetMinutes: -150,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 1,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: 'De Loods',
        description: 'All het materiaal van de loods naar de cantus brengen \n Adress loods: tervuursevest 238',
        openToInternationals: true,
      },
      {
        key: 'opbouw',
        name: 'Opbouw',
        startOffsetMinutes: -90,
        durationMinutes: 60,
        maxParticipants: 6,
        reward: 2,
        description: 'Zaal klaarzetten: tafels, stoelen, podia,...',
        openToInternationals: true,
      },
      {
        key: 'inkom',
        name: 'Inkom',
        startOffsetMinutes: -30,
        durationMinutes: 30,
        maxParticipants: 2,
        reward: 1,
        description: 'Tickets scannen en Polsbandjes uitdelen',
      },
      {
        key: 'tap-1',
        name: 'Tappen en rondbrengen',
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: 'Bier tappen en de kannen rondbrengen',
      },
      {
        key: 'pis-1',
        name: 'Pispolitie',
        startOffsetMinutes: 0,
        durationMinutes: 90,
        maxParticipants: 2,
        reward: 2,
        description: 'Mensen die naar het toilet willen een strafje geven',
      },
      {
        key: 'steward-1',
        name: 'Stewarden',
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt',
      },
      {
        key: 'controle-1',
        name: 'Bandjes controleren',
        startOffsetMinutes: 90,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Bandjes controleren tijdens de tempus',
      },
      {
        key: 'tap-2',
        name: 'Tappen en rondbrengen',
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 4,
        reward: 2,
        description: 'Bier tappen en de kannen rondbrengen',
      },
      {
        key: 'pis-2',
        name: 'Pispolitie',
        startOffsetMinutes: 105,
        durationMinutes: 105,
        maxParticipants: 2,
        reward: 2,
        description: 'Mensen die naar het toilet willen een strafje geven',
      },
      {
        key: 'steward-2',
        name: 'Stewarden',
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Zorgen dat er niemand luid is buiten en fiksen dat er geen drank buiten geraakt',
      },
      {
        key: 'controle-2',
        name: 'Bandjes controleren',
        startOffsetMinutes: 210,
        durationMinutes: 15,
        maxParticipants: 2,
        reward: 0,
        description: 'Bandjes controleren tijdens de tempus',
      },
      {
        key: 'stilhouden',
        name: 'Corona stilhouden',
        startOffsetMinutes: 225,
        durationMinutes: 45,
        maxParticipants: 2,
        reward: 1,
        description: 'De corona stilhouden voor het 3de deel',
      },
      {
        key: 'afbouw',
        name: 'Afbraak',
        startOffsetMinutes: 270,
        durationMinutes: 60,
        maxParticipants: 5,
        reward: 2,
        description: 'Please help ons mee en zorg dat we na een half uurtje klaar kunnen zijn :))',
        openToInternationals: true,
      },
      {
        key: 'bijrijden-2',
        name: 'Bijrijden',
        startOffsetMinutes: 330,
        durationMinutes: 60,
        maxParticipants: 2,
        reward: 2,
        // Bijrijden vertrekt altijd aan de loods, waar de cantus ook doorgaat.
        location: 'De Loods',
        description: 'All het materiaal terug naar de loods brengen \n Adress loods: tervuursevest 238',
        openToInternationals: true,
      },
    ],
  },
];

export default async function AdminShiftTemplates({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission('shift.edit');

  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

  // Zelfde keuzelijst als het gewone shiftformulier: enkel actieve posten.
  const activeGroups = await prisma.group.findMany({
    where: { active: true, type: 'PRAESIDIUM' },
    orderBy: { orderInPraesidium: 'asc' },
    select: { code: true },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{nl ? 'Shiften uit sjabloon' : 'Shifts from template'}</h1>
        <Link href={`${base}/admin/shiften`} className="text-sm text-vtk-blue underline">
          {nl ? 'Naar het shiftoverzicht' : 'To the shift overview'}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-zinc-500">
        {nl
          ? 'Kies een sjabloon, zet datum, uur en locatie goed, en verfijn daarna de shiften zelf. Bij opslaan worden ze meteen aangemaakt en staan ze op de shiftpagina.'
          : 'Pick a template, set date, time and location, then fine-tune the individual shifts. On save they are created and appear on the shift page right away.'}
      </p>
      <ShiftTemplateBuilder
        locale={locale}
        templates={SHIFT_TEMPLATES}
        today={utcToLocalDateTime(new Date()).slice(0, 10)}
        postOptions={activeGroups.map((g) => g.code)}
      />
    </div>
  );
}
