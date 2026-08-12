import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { savePianoConfigAction, savePianoInfoAction, deletePianoReservationAction } from "@/app/actions/piano";
import { formatMinutes } from "@/lib/piano";
import { getPianoConfig, getPianoInfo } from "@/lib/piano-server";
import { PianoWindowsManager, type WindowRow } from "./PianoWindowsManager";
import { PianoClosuresManager, type ClosureRow } from "./PianoClosuresManager";

const WEEKDAY_LABELS = {
  nl: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
} as const;

/** "YYYY-MM-DD" voor een date-veld, in Brussel-tijd (zoals opgeslagen). */
function toDateInput(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date);
}

/**
 * Beheer van de piano: hoe lang een slot duurt en hoeveel je er mag hebben, de
 * tekst boven de agenda, de terugkerende vensters, de sluitingsdagen, en wie wat
 * geboekt heeft.
 */
export default async function AdminPianoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  await requirePermission("piano.manage");

  const now = new Date();
  const [config, info, windowRows, closureRows, reservationRows] = await Promise.all([
    getPianoConfig(),
    getPianoInfo(),
    prisma.pianoWindow.findMany({ orderBy: [{ order: "asc" }, { labelNl: "asc" }] }),
    prisma.pianoClosure.findMany({ orderBy: { startDate: "asc" } }),
    prisma.pianoReservation.findMany({
      where: { endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const dayLabels = WEEKDAY_LABELS[nl ? "nl" : "en"];
  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const dayTimeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  const periodLabel = (start: Date, end: Date | null) => {
    const from = dateFmt.format(start);
    if (!end || toDateInput(start) === toDateInput(end)) return from;
    return `${from} ${nl ? "tot" : "until"} ${dateFmt.format(end)}`;
  };

  const windows: WindowRow[] = windowRows.map((row) => ({
    id: row.id,
    labelNl: row.labelNl,
    labelEn: row.labelEn ?? "",
    weekdays: row.weekdays,
    startTime: formatMinutes(row.startMinute),
    endTime: formatMinutes(row.endMinute),
    startDate: toDateInput(row.startDate),
    endDate: toDateInput(row.endDate),
    active: row.active,
    order: row.order,
    summary: [
      [...row.weekdays].sort((a, b) => a - b).map((d) => dayLabels[d - 1]).join(", "),
      `${formatMinutes(row.startMinute)}-${formatMinutes(row.endMinute)}`,
      row.startDate || row.endDate
        ? `${row.startDate ? dateFmt.format(row.startDate) : "…"} ${nl ? "tot" : "until"} ${row.endDate ? dateFmt.format(row.endDate) : "…"}`
        : nl
          ? "het hele jaar"
          : "all year",
    ].join(" · "),
  }));

  const closures: ClosureRow[] = closureRows.map((row) => ({
    id: row.id,
    reasonNl: row.reasonNl,
    reasonEn: row.reasonEn ?? "",
    periodLabel: periodLabel(row.startDate, row.endDate),
  }));

  const configErrors = nl
    ? {
        slotMinutes: "Een slot duurt tussen 15 minuten en 24 uur.",
        maxPerWeek: "Kies tussen 1 en 50 slots per week.",
        horizonDays: "Kies tussen 1 en 365 dagen vooruit.",
      }
    : {
        slotMinutes: "A slot lasts between 15 minutes and 24 hours.",
        maxPerWeek: "Pick between 1 and 50 slots per week.",
        horizonDays: "Pick between 1 and 365 days ahead.",
      };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Piano</h1>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Instellingen" : "Settings"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "De slotlengte deelt elk venster op. Verander je ze, dan verschuiven de uren op de pagina; reservaties die al gemaakt zijn, blijven op hun oorspronkelijke uur staan."
            : "The slot length splits every window. Changing it shifts the hours on the page; reservations already made stay at their original time."}
        </p>
        <SaveForm
          action={savePianoConfigAction}
          className="grid gap-4 sm:grid-cols-3"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
          errorMessages={configErrors}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div>
            <Label htmlFor="slotMinutes">{nl ? "Slotlengte (minuten)" : "Slot length (minutes)"}</Label>
            <Input
              id="slotMinutes"
              name="slotMinutes"
              type="number"
              min={15}
              max={1440}
              defaultValue={config.slotMinutes}
            />
          </div>
          <div>
            <Label htmlFor="maxPerWeek">{nl ? "Slots per lid per week" : "Slots per member per week"}</Label>
            <Input
              id="maxPerWeek"
              name="maxPerWeek"
              type="number"
              min={1}
              max={50}
              defaultValue={config.maxPerWeek}
            />
          </div>
          <div>
            <Label htmlFor="horizonDays">{nl ? "Dagen vooruit reserveren" : "Days you can book ahead"}</Label>
            <Input
              id="horizonDays"
              name="horizonDays"
              type="number"
              min={1}
              max={365}
              defaultValue={config.horizonDays}
            />
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Tekst op de pianopagina" : "Text on the piano page"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Staat boven de agenda. Hier hoort onder meer de afspraak over de begeleidende brief."
            : "Shown above the agenda. This is where the accompanying-letter arrangement belongs."}
        </p>
        <SaveForm
          action={savePianoInfoAction}
          className="grid gap-4 lg:grid-cols-2"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Tekst opgeslagen" : "Text saved"}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div>
            <Label htmlFor="piano-info-nl">{nl ? "Tekst (NL)" : "Text (NL)"}</Label>
            <MarkdownEditorField
              name="bodyNl"
              defaultValue={info.bodyNl}
              locale={locale}
              rows={8}
              allowImages={false}
              textareaId="piano-info-nl"
            />
          </div>
          <div>
            <Label htmlFor="piano-info-en">{nl ? "Tekst (EN)" : "Text (EN)"}</Label>
            <MarkdownEditorField
              name="bodyEn"
              defaultValue={info.bodyEn}
              locale={locale}
              rows={8}
              allowImages={false}
              textareaId="piano-info-en"
            />
          </div>
        </SaveForm>
      </Card>

      <PianoWindowsManager locale={locale} windows={windows} />
      <PianoClosuresManager locale={locale} closures={closures} />

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Komende reservaties" : "Upcoming reservations"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Enkel wat nog moet komen. Slots die voorbij zijn, verdwijnen vanzelf uit deze lijst."
            : "Only what is still ahead. Slots in the past drop off this list by themselves."}
        </p>

        {reservationRows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl ? "Er staat niets gereserveerd." : "Nothing is reserved."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {reservationRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-vtk-ink">
                    {dayTimeFmt.format(row.startsAt)} - {timeFmt.format(row.endsAt)}
                  </span>
                  <span className="block truncate text-xs text-[#5c667f]">
                    {row.user.name} · {row.user.email}
                  </span>
                </span>

                <DeleteIconButton
                  action={deletePianoReservationAction}
                  fields={{ id: row.id }}
                  label={nl ? "Schrappen" : "Remove"}
                  srLabel={`${nl ? "Schrappen" : "Remove"}: ${row.user.name}, ${dayTimeFmt.format(row.startsAt)}`}
                  title={nl ? "Reservatie schrappen?" : "Remove reservation?"}
                  description={
                    nl
                      ? `Het slot van ${row.user.name} op ${dayTimeFmt.format(row.startsAt)} komt weer vrij. Het lid krijgt hier geen bericht van; verwittig hen zelf.`
                      : `${row.user.name}'s slot on ${dayTimeFmt.format(row.startsAt)} becomes free again. The member is not notified; tell them yourself.`
                  }
                  confirmLabel={nl ? "Schrappen" : "Remove"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Reservatie geschrapt" : "Reservation removed"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
