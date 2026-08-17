import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import type { Locale } from "@vtk/i18n";
import { ShiftTemplateBuilder, type ShiftTemplate } from "./ShiftTemplateBuilder";

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
//   reward              aantal bonnetjes; weglaten = `defaults.reward`.
//   location / post     enkel invullen wanneer deze shift afwijkt van de
//                       globale locatie/post die je bovenaan kiest.
//   enabled: false      staat standaard uitgevinkt (bv. een shift die je enkel
//                       bij een grote editie nodig hebt).
// -----------------------------------------------------------------------------

const SHIFT_TEMPLATES: ShiftTemplate[] = [
  {
    id: "cantus",
    label: "Cantus",
    note: "Klassieke cantus: opbouw, inkom, bar en tap, afbouw achteraf.",
    defaults: {
      eventName: "Cantus",
      location: "Alma 2",
      post: "ACTIVITEITEN",
      reward: 1,
      timeOfDay: "20:00",
    },
    shifts: [
      {
        key: "opbouw",
        name: "Opbouw",
        startOffsetMinutes: -90,
        durationMinutes: 90,
        maxParticipants: 6,
        description: "Zaal klaarzetten: tafels, banken, vaten en glazen.",
        openToInternationals: true,
      },
      {
        key: "inkom",
        name: "Inkom",
        startOffsetMinutes: -30,
        durationMinutes: 90,
        maxParticipants: 2,
        description: "Tickets scannen en geld ontvangen aan de deur.",
      },
      {
        key: "tap-1",
        name: "Tap 1",
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 3,
        description: "Bier tappen en de kannen rondbrengen.",
      },
      {
        key: "tap-2",
        name: "Tap 2",
        startOffsetMinutes: 120,
        durationMinutes: 120,
        maxParticipants: 3,
        description: "Bier tappen en de kannen rondbrengen.",
      },
      {
        key: "vaten",
        name: "Vaten",
        startOffsetMinutes: 0,
        durationMinutes: 240,
        maxParticipants: 2,
        reward: 2,
        description: "Vaten aansluiten en wisselen, voorraad opvolgen.",
      },
      {
        key: "afbouw",
        name: "Afbouw",
        startOffsetMinutes: 240,
        durationMinutes: 120,
        maxParticipants: 8,
        reward: 2,
        description: "Opkuisen, glazen afwassen en de zaal leegmaken.",
        openToInternationals: true,
      },
    ],
  },
  {
    id: "fakbar",
    label: "Fakbaravond",
    note: "Avond in de fakbar: twee bar-shiften en de kuis achteraf.",
    defaults: {
      eventName: "Fakbar",
      location: "Fakbar",
      post: "FAKBAR",
      reward: 1,
      timeOfDay: "21:00",
    },
    shifts: [
      {
        key: "bar-1",
        name: "Bar 1",
        startOffsetMinutes: 0,
        durationMinutes: 150,
        maxParticipants: 3,
        description: "Achter de bar staan: bestellingen, kassa, glazen.",
      },
      {
        key: "bar-2",
        name: "Bar 2",
        startOffsetMinutes: 150,
        durationMinutes: 150,
        maxParticipants: 3,
        description: "Achter de bar staan: bestellingen, kassa, glazen.",
      },
      {
        key: "bar-3",
        name: "Bar 3",
        startOffsetMinutes: 300,
        durationMinutes: 150,
        maxParticipants: 2,
        reward: 2,
        description: "Late shift achter de bar.",
        enabled: false,
      },
      {
        key: "kuis",
        name: "Kuis",
        startOffsetMinutes: 450,
        durationMinutes: 90,
        maxParticipants: 4,
        reward: 2,
        description: "Bar en zaal opkuisen na sluiting.",
        openToInternationals: true,
      },
    ],
  },
  {
    id: "td",
    label: "TD",
    note: "Fuif met inkom, vestiaire en meerdere bar-shiften.",
    defaults: {
      eventName: "TD",
      location: "Albatros",
      post: "ACTIVITEITEN",
      reward: 1,
      timeOfDay: "22:00",
    },
    shifts: [
      {
        key: "opbouw",
        name: "Opbouw",
        startOffsetMinutes: -120,
        durationMinutes: 120,
        maxParticipants: 6,
        description: "Bar, vestiaire en inkom klaarzetten.",
        openToInternationals: true,
      },
      {
        key: "inkom-1",
        name: "Inkom 1",
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 2,
        description: "Tickets scannen en geld ontvangen aan de deur.",
      },
      {
        key: "inkom-2",
        name: "Inkom 2",
        startOffsetMinutes: 120,
        durationMinutes: 120,
        maxParticipants: 2,
        description: "Tickets scannen en geld ontvangen aan de deur.",
      },
      {
        key: "vestiaire-1",
        name: "Vestiaire 1",
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 2,
        description: "Jassen aannemen en teruggeven.",
        openToInternationals: true,
      },
      {
        key: "vestiaire-2",
        name: "Vestiaire 2",
        startOffsetMinutes: 120,
        durationMinutes: 180,
        maxParticipants: 2,
        description: "Jassen aannemen en teruggeven.",
        openToInternationals: true,
      },
      {
        key: "bar-1",
        name: "Bar 1",
        startOffsetMinutes: 0,
        durationMinutes: 120,
        maxParticipants: 4,
        description: "Achter de bar staan: bestellingen, kassa, glazen.",
      },
      {
        key: "bar-2",
        name: "Bar 2",
        startOffsetMinutes: 120,
        durationMinutes: 120,
        maxParticipants: 4,
        description: "Achter de bar staan: bestellingen, kassa, glazen.",
      },
      {
        key: "bar-3",
        name: "Bar 3",
        startOffsetMinutes: 240,
        durationMinutes: 120,
        maxParticipants: 3,
        reward: 2,
        description: "Late shift achter de bar.",
      },
      {
        key: "afbouw",
        name: "Afbouw",
        startOffsetMinutes: 360,
        durationMinutes: 120,
        maxParticipants: 8,
        reward: 2,
        description: "Opkuisen en het materiaal terug inladen.",
        openToInternationals: true,
      },
    ],
  },
];

export default async function AdminShiftTemplates({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("shift.edit");

  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  // Zelfde keuzelijst als het gewone shiftformulier: enkel actieve posten.
  const activeGroups = await prisma.group.findMany({
    where: { active: true, type: "PRAESIDIUM" },
    orderBy: { orderInPraesidium: "asc" },
    select: { code: true },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {nl ? "Shiften uit sjabloon" : "Shifts from template"}
        </h1>
        <Link href={`${base}/admin/shiften`} className="text-sm text-vtk-blue underline">
          {nl ? "Naar het shiftoverzicht" : "To the shift overview"}
        </Link>
      </div>
      <p className="max-w-3xl text-sm text-zinc-500">
        {nl
          ? "Kies een sjabloon, zet datum, uur en locatie goed, en verfijn daarna de shiften zelf. Bij opslaan worden ze meteen aangemaakt en staan ze op de shiftpagina."
          : "Pick a template, set date, time and location, then fine-tune the individual shifts. On save they are created and appear on the shift page right away."}
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
