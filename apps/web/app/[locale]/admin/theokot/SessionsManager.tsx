"use client";

import Link from "@/components/ui/Link";
import { Fragment, useMemo, useState } from "react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { IconLink } from "@/components/ui/IconButton";
import { ListCheckIcon } from "@/components/ui/icons";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  closeSessionNowAction,
  createWeekSessionsAction,
  removeOrderAction,
  removeSessionAction,
  updateSessionAction,
  updateSessionItemsAction,
  updateWeekItemsAction,
} from "@/app/actions/theokot";
import { OfferingRows, type OfferingRow } from "./OfferingRows";

/** Waar een verkoopdag staat; de tabel toont het als een woord met een kleur. */
export type AdminSessionStatus = "upcoming" | "ordering" | "pickup" | "past" | "off";

export type AdminSession = {
  id: string;
  dateLabel: string;
  /** "ma 28 sep" */
  shortLabel: string;
  dateValue: string;
  /** De maandag van de week, "YYYY-MM-DD": de dagen staan per week. */
  weekStart: string;
  /** "Week van 28 september" */
  weekLabel: string;
  /** "12:00–16:00" */
  pickupLabel: string;
  /** "za 12:00 – ma 10:30" */
  orderWindowLabel: string;
  status: AdminSessionStatus;
  isOpen: boolean;
  pickupStart: string;
  pickupEnd: string;
  orderCloseTime: string;
  orderOpenAt: string;
  processed: boolean;
  orderCount: number;
  /**
   * Bestellingen die al opgehaald zijn of waarop bonnetjes afgeboekt zijn.
   * Zolang dat er zijn, kan de dag niet meer weg; ze zijn echt gebeurd.
   */
  pickedUpCount: number;
  /** De afhaal van deze dag is voorbij, dus sluiten heeft geen zin meer. */
  closed: boolean;
  items: OfferingRow[];
  orders: AdminOrder[];
};

export type AdminOrder = {
  id: string;
  userName: string;
  rNumber: string;
  status: string;
  itemsLabel: string;
  totalLabel: string;
  /** Opgehaald of met bonnetjes betaald: dan blijft ze staan. */
  canRemove: boolean;
};

export type DefaultHours = {
  pickupStart: string;
  pickupEnd: string;
  orderCloseTime: string;
  orderOpenTime: string;
};

const DAYS = [
  { v: 0, nl: "Ma", en: "Mon" },
  { v: 1, nl: "Di", en: "Tue" },
  { v: 2, nl: "Wo", en: "Wed" },
  { v: 3, nl: "Do", en: "Thu" },
  { v: 4, nl: "Vr", en: "Fri" },
  { v: 5, nl: "Za", en: "Sat" },
  { v: 6, nl: "Zo", en: "Sun" },
];

export function SessionsManager({
  nl,
  sessions,
  nextMonday,
  defaultProducts,
  defaultHours,
}: {
  nl: boolean;
  sessions: AdminSession[];
  nextMonday: string;
  defaultProducts: OfferingRow[];
  defaultHours: DefaultHours;
}) {
  const base = nl ? "" : "/en";
  // Eén bewerktaak tegelijk: een nieuwe week, het aanbod van een week, of één
  // dag. Openen van het ene sluit het andere.
  const [open, setOpen] = useState<
    { kind: "create" } | { kind: "week"; weekStart: string } | { kind: "day"; id: string } | null
  >(null);

  const weeks = useMemo(() => {
    const groups: Array<{ weekStart: string; label: string; days: AdminSession[] }> = [];
    for (const session of sessions) {
      const last = groups.at(-1);
      if (last && last.weekStart === session.weekStart) last.days.push(session);
      else groups.push({ weekStart: session.weekStart, label: session.weekLabel, days: [session] });
    }
    return groups;
  }, [sessions]);

  const creating = open?.kind === "create";

  return (
    <div className="space-y-5">
      {/* Wat je hier kan doen, boven de vouw: een nieuwe week openzetten of het
          standaardaanbod aanpassen. De bestaande dagen staan eronder per week. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => setOpen(creating ? null : { kind: "create" })} aria-expanded={creating}>
          {nl ? "Nieuwe verkoopweek" : "New sale week"}
        </Button>
        <Link
          href={`${base}/admin/theokot/instellingen#standaardaanbod`}
          className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm text-vtk-ink hover:bg-vtk-blue-soft/60"
        >
          {nl ? "Standaardaanbod aanpassen" : "Edit default offering"}
        </Link>
      </div>

      {creating && (
        <CreateWeek
          nl={nl}
          nextMonday={nextMonday}
          defaultProducts={defaultProducts}
          defaultHours={defaultHours}
          onDone={() => setOpen(null)}
        />
      )}

      {weeks.length === 0 && !creating && (
        <div className="vtk-basic-empty">
          {nl
            ? "Er staan geen verkoopdagen gepland. Zet er met “Nieuwe verkoopweek” een hele week in één keer online."
            : "No sale days are planned. Use “New sale week” to put a whole week online at once."}
        </div>
      )}

      {weeks.map((week) => (
        <WeekCard
          key={week.weekStart}
          nl={nl}
          label={week.label}
          days={week.days}
          editingWeek={open?.kind === "week" && open.weekStart === week.weekStart}
          openDayId={open?.kind === "day" ? open.id : null}
          onToggleWeek={(on) => setOpen(on ? { kind: "week", weekStart: week.weekStart } : null)}
          onToggleDay={(id) => setOpen(open?.kind === "day" && open.id === id ? null : { kind: "day", id })}
        />
      ))}
    </div>
  );
}

function CreateWeek({
  nl,
  nextMonday,
  defaultProducts,
  defaultHours,
  onDone,
}: {
  nl: boolean;
  nextMonday: string;
  defaultProducts: OfferingRow[];
  defaultHours: DefaultHours;
  onDone: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{nl ? "Nieuwe verkoopweek" : "New sale week"}</h2>
        <button type="button" onClick={onDone} className="text-sm text-[#5c667f] underline underline-offset-2 hover:text-vtk-ink">
          {nl ? "Sluiten" : "Close"}
        </button>
      </div>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Uren en aanbod gelden voor de hele week; nadien kan je per dag of per week bijsturen. Dagen die al bestaan, worden overgeslagen. Elke nieuwe dag krijgt meteen zijn Theokot-shiften (smeren, middag, namiddag)."
          : "Hours and offering apply to the whole week; you can adjust per day or per week afterwards. Existing days are skipped. Every new day gets its Theokot shifts (spreading, midday, afternoon) right away."}
      </p>
      <SaveForm
        action={createWeekSessionsAction}
        className="space-y-4"
        submitLabel={nl ? "Week aanmaken" : "Create week"}
        savingLabel={nl ? "Bezig..." : "Creating..."}
        savedMessage={nl ? "Verkoopweek aangemaakt" : "Sale week created"}
        resetOnSuccess={false}
        onSuccess={onDone}
        errorMessages={
          nl
            ? {
                INVALID_WEEKSTART: "Kies een geldige maandag voor deze week.",
                INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op.",
                ORDER_WINDOW_EMPTY:
                  "Niet aangemaakt: met deze uren sluit het bestellen voor het opengaat. Kijk 'Bestellen opent', de besteldeadline en het aantal dagen vooraf na.",
                PICKUP_WINDOW_EMPTY:
                  "Niet aangemaakt: het afhaaluur eindigt voor het begint.",
              }
            : {
                INVALID_WEEKSTART: "Pick a valid Monday for this week.",
                INVALID_IMAGE: "One of the photos is not valid. Upload it again.",
                ORDER_WINDOW_EMPTY:
                  "Not created: with these hours ordering closes before it opens. Check 'Ordering opens', the order deadline and the lead days.",
                PICKUP_WINDOW_EMPTY: "Not created: the pickup window ends before it starts.",
              }
        }
        fallbackErrorMessage={nl ? "Week aanmaken mislukt." : "Creating the week failed."}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label>{nl ? "Maandag van de week" : "Monday of the week"}</Label>
            <Input type="date" name="weekStart" defaultValue={nextMonday} required />
          </div>
          <div>
            <Label>{nl ? "Dagen" : "Days"}</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {DAYS.map((d) => (
                <label key={d.v} className="inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" name="days" value={d.v} defaultChecked={d.v <= 4} />
                  {nl ? d.nl : d.en}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label>{nl ? "Afhalen vanaf" : "Pickup from"}</Label>
            <Input type="time" name="pickupStart" defaultValue={defaultHours.pickupStart} />
          </div>
          <div>
            <Label>{nl ? "Afhalen tot" : "Pickup until"}</Label>
            <Input type="time" name="pickupEnd" defaultValue={defaultHours.pickupEnd} />
          </div>
          <div>
            <Label>{nl ? "Besteldeadline (uur)" : "Order deadline (time)"}</Label>
            <Input type="time" name="orderCloseTime" defaultValue={defaultHours.orderCloseTime} />
          </div>
          <div>
            <Label>{nl ? "Bestellen opent (uur)" : "Ordering opens (time)"}</Label>
            <Input type="time" name="orderOpenTime" defaultValue={defaultHours.orderOpenTime} />
          </div>
        </div>

        <div className="rounded-xl border border-vtk-blue/10 p-3">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-vtk-ink">
              {nl ? "Aanbod voor deze week" : "Offering for this week"}
            </span>
            <span className="text-xs text-[#5c667f]">
              {nl
                ? "Ingevuld met het standaardaanbod. Wat je hier aanpast, geldt enkel voor deze week."
                : "Filled in from the default offering. Changes here only apply to this week."}
            </span>
          </div>
          <OfferingRows nl={nl} initial={defaultProducts} prefix="item" countField="itemCount" />
        </div>

      </SaveForm>
    </Card>
  );
}

const STATUS_STYLE: Record<AdminSessionStatus, { nl: string; en: string; className: string }> = {
  upcoming: { nl: "Nog niet open", en: "Not open yet", className: "bg-[var(--paper-2)] text-[var(--muted)]" },
  ordering: { nl: "Bestellen open", en: "Ordering open", className: "bg-[var(--yellow)] text-[var(--ink)]" },
  pickup: { nl: "Afhalen", en: "Pickup", className: "bg-[var(--ok-bg)] text-[var(--ok-ink)]" },
  past: { nl: "Voorbij", en: "Past", className: "bg-[var(--paper-2)] text-[var(--muted)]" },
  off: { nl: "Gaat niet door", en: "Not happening", className: "bg-[var(--danger-bg)] text-[var(--danger-ink)]" },
};

/**
 * Eén week: de dagen als compacte rijen, met één knop om het aanbod van de hele
 * week in één keer aan te passen. Een klik op een rij klapt die dag open.
 */
function WeekCard({
  nl,
  label,
  days,
  editingWeek,
  openDayId,
  onToggleWeek,
  onToggleDay,
}: {
  nl: boolean;
  label: string;
  days: AdminSession[];
  editingWeek: boolean;
  openDayId: string | null;
  onToggleWeek: (on: boolean) => void;
  onToggleDay: (id: string) => void;
}) {
  const base = nl ? "" : "/en";
  const editable = days.filter((day) => day.status !== "past");
  const orders = days.reduce((sum, day) => sum + day.orderCount, 0);
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
        <div>
          <h2 className="text-lg font-semibold">{label}</h2>
          <p className="text-sm text-[#5c667f]">
            {days.length} {nl ? (days.length === 1 ? "verkoopdag" : "verkoopdagen") : days.length === 1 ? "sale day" : "sale days"} ·{" "}
            {orders} {nl ? (orders === 1 ? "bestelling" : "bestellingen") : orders === 1 ? "order" : "orders"}
          </p>
        </div>
        {editable.length > 0 && (
          <Button
            type="button"
            variant={editingWeek ? "primary" : "ghost"}
            size="sm"
            onClick={() => onToggleWeek(!editingWeek)}
            aria-expanded={editingWeek}
          >
            {nl ? "Aanbod van de week" : "Offering for the week"}
          </Button>
        )}
      </div>

      {editingWeek && editable.length > 0 && (
        <WeekOfferingEditor nl={nl} days={editable} onDone={() => onToggleWeek(false)} />
      )}

      <div className="relative overflow-x-auto border-t border-vtk-blue/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
              <th className="px-5 py-2 font-semibold">{nl ? "Dag" : "Day"}</th>
              <th className="px-3 py-2 font-semibold">{nl ? "Afhalen" : "Pickup"}</th>
              <th className="px-3 py-2 font-semibold">{nl ? "Bestellen" : "Ordering"}</th>
              <th className="px-3 py-2 text-right font-semibold">{nl ? "Bestellingen" : "Orders"}</th>
              <th className="px-3 py-2 font-semibold">{nl ? "Status" : "Status"}</th>
              <th className="px-5 py-2">
                <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const isOpen = openDayId === day.id;
              const status = STATUS_STYLE[day.status];
              return (
                <Fragment key={day.id}>
                  <tr
                    className={`cursor-pointer border-t border-vtk-blue/10 hover:bg-vtk-blue-soft/40 ${isOpen ? "bg-vtk-blue-soft/50" : ""}`}
                    onClick={() => onToggleDay(day.id)}
                  >
                    <td className="px-5 py-3">
                      {/* De rij zelf is klikbaar; deze knop is er voor het
                          toetsenbord en de screenreader. */}
                      <button
                        type="button"
                        className="font-medium text-vtk-ink"
                        aria-expanded={isOpen}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleDay(day.id);
                        }}
                      >
                        {day.shortLabel}
                      </button>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-[#34405e]">{day.pickupLabel}</td>
                    <td className="px-3 py-3 tabular-nums text-[#5c667f]">{day.orderWindowLabel}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{day.orderCount}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>
                        {nl ? status.nl : status.en}
                      </span>
                    </td>
                    <td className="px-5 py-3" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <IconLink
                          href={`${base}/admin/theokot/turflijst?date=${day.dateValue}`}
                          label={nl ? "Lijst bestelde broodjes" : "Ordered sandwiches list"}
                          srLabel={nl ? `Lijst bestelde broodjes: ${day.dateLabel}` : `Ordered sandwiches list: ${day.dateLabel}`}
                        >
                          <ListCheckIcon />
                        </IconLink>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="border-t border-vtk-blue/10 bg-vtk-blue-soft/20 px-5 py-4">
                        <SessionEditor nl={nl} session={day} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Het aanbod van een hele week in één keer: de editor toont het aanbod van de
 * eerste dag die nog komt, en wat je opslaat, komt op elke aangevinkte dag.
 */
function WeekOfferingEditor({
  nl,
  days,
  onDone,
}: {
  nl: boolean;
  days: AdminSession[];
  onDone: () => void;
}) {
  const template = days[0]!;
  // Wat er op de voorbeelddag al besteld is, zegt niets over de andere dagen;
  // de melding "x besteld" per rij zou hier misleiden.
  const initial = useMemo(
    () => template.items.map((item) => ({ ...item, ordered: 0 })),
    [template.items],
  );
  return (
    <div className="border-t border-vtk-blue/10 bg-vtk-blue-soft/20 px-5 py-4">
      <p className="mb-3 text-sm text-[#34405e]">
        {nl
          ? `Dit is het aanbod van ${template.dateLabel}. Wat je opslaat, komt op elke aangevinkte dag, ook als die dag een eigen afwijking had. Een broodje dat al besteld is, blijft staan; openstaande reservaties krijgen de nieuwe prijs.`
          : `This is the offering of ${template.dateLabel}. What you save goes onto every ticked day, even if that day had its own changes. A sandwich that has orders stays; open reservations get the new price.`}
      </p>
      <SaveForm
        action={updateWeekItemsAction}
        className="space-y-4"
        submitLabel={nl ? "Aanbod op deze dagen zetten" : "Apply offering to these days"}
        savingLabel={nl ? "Bezig..." : "Saving..."}
        savedMessage={nl ? "Aanbod van de week opgeslagen" : "Week offering saved"}
        resetOnSuccess={false}
        onSuccess={onDone}
        errorMessages={
          nl
            ? {
                NO_DAYS_SELECTED: "Niet opgeslagen: vink minstens één dag aan die nog moet komen.",
                SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer. Herlaad de pagina.",
                ITEM_NOT_IN_SESSION: "Niet opgeslagen: het aanbod is intussen veranderd. Herlaad de pagina.",
                INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op.",
              }
            : {
                NO_DAYS_SELECTED: "Not saved: tick at least one upcoming day.",
                SESSION_NOT_FOUND: "This sale day no longer exists. Reload the page.",
                ITEM_NOT_IN_SESSION: "Not saved: the offering changed meanwhile. Reload the page.",
                INVALID_IMAGE: "One of the photos is not valid. Upload it again.",
              }
        }
        fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
      >
        <input type="hidden" name="templateSessionId" value={template.id} />
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
            {nl ? "Toepassen op" : "Apply to"}
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {days.map((day) => (
              <label
                key={day.id}
                className="inline-flex items-center gap-2 rounded-full border border-vtk-blue/15 bg-white px-3 py-1.5 text-sm"
              >
                <input type="checkbox" name="applyTo" value={day.id} defaultChecked />
                {day.shortLabel}
              </label>
            ))}
          </div>
        </fieldset>
        <OfferingRows nl={nl} initial={initial} prefix="item" countField="itemCount" />
      </SaveForm>
    </div>
  );
}

function SessionEditor({ nl, session }: { nl: boolean; session: AdminSession }) {
  // Hoeveel gereserveerde broodjes er sneuvelen als het aanbod zo opgeslagen
  // wordt. De aanbodtabel rekent het uit; hier hangt de bevestiging eraan.
  const [shortfall, setShortfall] = useState(0);
  // Staat open onder zijn rij in de weektabel; de datum, de uren en het aantal
  // bestellingen staan al in die rij, dus hier enkel wat je ermee kan doen.
  return (
    <div className="space-y-1">
      {/* Twee handelingen die op elkaar lijken en het niet zijn: sluiten rondt de
          verkoop af (wat niet opgehaald is, telt als niet opgehaald), verwijderen
          is voor de dag die niet doorgaat. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!session.closed && (
          <SaveForm
            action={closeSessionNowAction}
            submitLabel={nl ? "Afhaalronde afsluiten" : "End pickup round"}
            submitVariant="ghost"
            submitSize="sm"
            savingLabel={nl ? "Bezig..." : "Closing..."}
            savedMessage={nl ? "Afhaalronde afgesloten" : "Pickup round ended"}
            confirmSubmit={{
              title: nl ? "Afhaalronde nu afsluiten?" : "End the pickup round now?",
              description: nl
                ? "De afhaal is voorbij: er kan niets meer bijbesteld of geannuleerd worden en wat een kwartier later niet opgehaald is, telt als niet opgehaald. De dag zelf blijft bestaan, met haar bestellingen en haar historiek. Wat je daarna toch nog uitdeelt, zet je aan de balie op opgehaald."
                : "Pickup stops right away and nothing can be ordered or cancelled anymore. Whatever is not collected a quarter of an hour later counts as not picked up. The day itself stays, with its orders and its history.",
              confirmLabel: nl ? "Afhaalronde afsluiten" : "End pickup round",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            }}
            errorMessages={
              nl
                ? {
                    SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer.",
                    SESSION_ALREADY_CLOSED: "De afhaal van deze dag is al voorbij.",
                  }
                : {
                    SESSION_NOT_FOUND: "This sale day no longer exists.",
                    SESSION_ALREADY_CLOSED: "Pickup for this day is already over.",
                  }
            }
            fallbackErrorMessage={nl ? "Sluiten mislukt." : "Closing failed."}
          >
            <input type="hidden" name="sessionId" value={session.id} />
          </SaveForm>
        )}

        {session.pickedUpCount === 0 ? (
          <DeleteButton
            action={removeSessionAction}
            fields={{ sessionId: session.id }}
            title={nl ? "Verkoopdag verwijderen?" : "Remove this sale day?"}
            description={
              nl
                ? `${session.dateLabel} verdwijnt met haar aanbod en haar ${session.orderCount} bestelling(en). Iedereen die besteld had, krijgt een mail dat die dag niet doorgaat. Gaat de dag wel door en ben je gewoon klaar met verkopen, gebruik dan "Afhaalronde afsluiten".`
                : `${session.dateLabel} disappears with its offering and its ${session.orderCount} order(s). Everyone who ordered gets an email that the day is not happening. If the day did happen and you are simply done selling, use "End pickup round" instead.`
            }
            confirmLabel={nl ? "Verwijderen" : "Remove"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Verkoopdag verwijderd" : "Sale day removed"}
          >
            {nl ? "Verkoopdag verwijderen" : "Remove sale day"}
          </DeleteButton>
        ) : (
          <span className="text-xs text-[#5c667f]">
            {nl
              ? `Er zijn al ${session.pickedUpCount} bestelling(en) opgehaald of met bonnetjes betaald, dus deze dag kan niet meer verwijderd worden. Sluiten kan wel.`
              : `${session.pickedUpCount} order(s) have already been picked up or paid with vouchers, so this day can no longer be removed. Closing it still works.`}
          </span>
        )}
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? "Uren & status bewerken" : "Edit hours & status"}
        </summary>
        <SaveForm
          action={updateSessionAction}
          className="mt-3 grid gap-4 sm:grid-cols-2"
          submitLabel={nl ? "Uren opslaan" : "Save hours"}
          savingLabel={nl ? "Bezig..." : "Saving..."}
          savedMessage={nl ? "Uren opgeslagen" : "Hours saved"}
          errorMessages={
            nl
              ? {
                  SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer.",
                  INVALID_TIME: "Niet opgeslagen: kijk de ingevulde uren na.",
                  ORDER_WINDOW_EMPTY:
                    "Niet opgeslagen: de besteldeadline ligt voor het moment waarop bestellen opent, dus niemand kan deze dag bestellen.",
                  PICKUP_WINDOW_EMPTY:
                    "Niet opgeslagen: 'Afhalen tot' ligt voor 'Afhalen vanaf'.",
                }
              : {
                  SESSION_NOT_FOUND: "This sale day no longer exists.",
                  INVALID_TIME: "Not saved: please check the times you entered.",
                  ORDER_WINDOW_EMPTY:
                    "Not saved: the order deadline falls before ordering opens, so nobody can order this day.",
                  PICKUP_WINDOW_EMPTY: "Not saved: 'Pickup until' falls before 'Pickup from'.",
                }
          }
          fallbackErrorMessage={nl ? "Opslaan van de uren mislukt." : "Saving the hours failed."}
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="isOpen" defaultChecked={session.isOpen} />
              {nl ? "Theokot gaat door deze dag" : "Theokot is happening this day"}
            </label>
            {/* Dit vinkje en "Nu sluiten" lijken op elkaar en zijn het niet; dat
                hoort op het scherm te staan en niet enkel in de code. */}
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Haal je dit weg, dan gaat de dag niet door: gereserveerde broodjes voor een grocomeet of bureau van die dag worden ongeldig en die mensen krijgen een mail. Ben je gewoon klaar met verkopen, gebruik dan “Afhaalronde afsluiten”."
                : "Unchecking this means the day is not happening: sandwiches reserved for a grocomeet or bureau that day are invalidated and those people get an email. If you are simply done selling, use “End pickup round” instead."}
            </p>
          </div>
          <div>
            <Label>{nl ? "Afhalen vanaf" : "Pickup from"}</Label>
            <Input type="time" name="pickupStart" defaultValue={session.pickupStart} />
          </div>
          <div>
            <Label>{nl ? "Afhalen tot" : "Pickup until"}</Label>
            <Input type="time" name="pickupEnd" defaultValue={session.pickupEnd} />
          </div>
          <div>
            <Label>{nl ? "Besteldeadline (uur)" : "Order deadline (time)"}</Label>
            <Input type="time" name="orderCloseTime" defaultValue={session.orderCloseTime} />
          </div>
          <div>
            <Label>{nl ? "Bestellen opent" : "Ordering opens"}</Label>
            <Input type="datetime-local" name="orderOpenAt" defaultValue={session.orderOpenAt} />
          </div>
        </SaveForm>
      </details>

      <details className="group mt-2">
        <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
          {nl ? `Aanbod bewerken (${session.items.length})` : `Edit offering (${session.items.length})`}
        </summary>
        <SaveForm
          action={updateSessionItemsAction}
          className="mt-3 space-y-2"
          submitLabel={nl ? "Aanbod opslaan" : "Save offering"}
          savingLabel={nl ? "Bezig..." : "Saving..."}
          savedMessage={nl ? "Aanbod opgeslagen" : "Offering saved"}
          errorMessages={
            nl
              ? {
                  INVALID_IMAGE: "Eén van de foto's is niet geldig. Laad ze opnieuw op.",
                  ITEM_NOT_IN_SESSION:
                    "Niet opgeslagen: een van de broodjes hoort niet bij deze verkoopdag. Herlaad de pagina.",
                }
              : {
                  INVALID_IMAGE: "One of the photos is not valid. Upload it again.",
                  ITEM_NOT_IN_SESSION:
                    "Not saved: one of the sandwiches does not belong to this sale day. Reload the page.",
                }
          }
          fallbackErrorMessage={nl ? "Opslaan van het aanbod mislukt." : "Saving the offering failed."}
          confirmSubmit={
            shortfall > 0
              ? {
                  title: nl ? "Minder broodjes dan besteld?" : "Fewer sandwiches than ordered?",
                  description: nl
                    ? `Je zet het aanbod onder wat er al gereserveerd is: ${shortfall} gereserveerd(e) broodje(s) meer dan er zullen zijn. Er wordt niets automatisch geschrapt; de bestellingen blijven staan. Kies zelf wie eruit gaat bij "Bestellingen" hieronder, dan krijgt die student er een mail over.`
                    : `You are setting the offering below what is already reserved: ${shortfall} reserved sandwich(es) more than there will be. Nothing is dropped automatically; the orders stay. Pick who goes under "Orders" below, and that student gets an email about it.`,
                  confirmLabel: nl ? "Toch opslaan" : "Save anyway",
                  cancelLabel: nl ? "Annuleren" : "Cancel",
                }
              : null
          }
        >
          <input type="hidden" name="sessionId" value={session.id} />
          <OfferingRows
            nl={nl}
            initial={session.items}
            prefix="item"
            countField="itemCount"
            onShortfall={setShortfall}
          />
        </SaveForm>
      </details>

      {session.orders.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer text-sm text-vtk-ink/80 hover:text-vtk-ink">
            {nl ? `Bestellingen (${session.orders.length})` : `Orders (${session.orders.length})`}
          </summary>
          {/* Hier kies je zelf wie eruit gaat wanneer er minder broodjes zijn dan
              er besteld is; er wordt niets automatisch geschrapt. */}
          <p className="mt-2 text-xs text-[#5c667f]">
            {nl
              ? "Een bestelling schrappen wist ze en verwittigt de student per mail. De broodjes komen weer vrij en die student kan opnieuw reserveren zolang het bestelvenster openstaat."
              : "Removing an order deletes it and emails the student. The sandwiches become available again and that student can reserve again while ordering is open."}
          </p>
          <ul className="mt-2 divide-y divide-vtk-blue/10">
            {session.orders.map((order) => (
              <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-vtk-ink">{order.userName}</span>
                <span className="text-xs text-[#5c667f]">{order.rNumber}</span>
                <span className="text-[#34405e]">{order.itemsLabel}</span>
                <span className="tabular-nums text-[#5c667f]">{order.totalLabel}</span>
                <span className="ml-auto flex items-center gap-2">
                  {order.status !== "RESERVED" && (
                    <span className="text-xs text-[#5c667f]">
                      {order.status === "PICKED_UP"
                        ? nl
                          ? "opgehaald"
                          : "picked up"
                        : order.status === "NO_SHOW"
                          ? nl
                            ? "niet opgehaald"
                            : "not picked up"
                          : order.status.toLowerCase()}
                    </span>
                  )}
                  {order.canRemove && (
                    <DeleteIconButton
                      action={removeOrderAction}
                      fields={{ orderId: order.id }}
                      label={nl ? "Bestelling schrappen" : "Remove order"}
                      srLabel={
                        nl
                          ? `Bestelling schrappen: ${order.userName}`
                          : `Remove order: ${order.userName}`
                      }
                      title={nl ? "Bestelling schrappen?" : "Remove this order?"}
                      description={
                        nl
                          ? `De bestelling van ${order.userName} (${order.itemsLabel}) wordt gewist en ${order.userName} krijgt een mail dat ze geannuleerd is. De broodjes komen weer vrij.`
                          : `${order.userName}'s order (${order.itemsLabel}) is deleted and ${order.userName} gets an email that it was cancelled. The sandwiches become available again.`
                      }
                      confirmLabel={nl ? "Schrappen" : "Remove"}
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Bestelling geschrapt" : "Order removed"}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
