"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Input, Label, Select } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { IconButton, IconLink, RowActions } from "@/components/ui/IconButton";
import { CalendarPlusIcon, CheckIcon, CloseIcon, UndoIcon } from "@/components/ui/icons";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { useToast } from "@/components/ui/toast";
import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { isoWeekday, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { cancelAfwasAction, saveAfwasAction, toggleAfwasWashedAction } from "@/app/actions/theokotAfwas";
import type { AfwasBlock, TheokotDayState } from "@/lib/theokotAfwas";

/** Eén afwas, zoals de pagina ze uitrekende. */
export type AfwasEntryView = {
  id: string;
  groupId: string;
  groupName: string;
  /** "3 bakken · Ecocups, glazen". */
  what: string;
  note: string | null;
  eventKey: string | null;
  eventLabel: string | null;
  dayKey: string | null;
  /** "di 24 nov, 14:00–16:00". */
  dayLabel: string | null;
  /** De geboekte uren van die dag (0, 1, 2). */
  hours: number[];
  /** Een groep van wie kijkt. */
  own: boolean;
  washed: boolean;
  washedBy: string | null;
  createdBy: string | null;
  canToggle: boolean;
  canCancel: boolean;
  /** Mag wie kijkt een namiddag kiezen of verzetten? */
  canPick: boolean;
  /** De maandag (`yyyy-mm-dd`) van de week na het evenement, om die week aan te duiden. */
  weekAfterKey: string | null;
  /** De namiddag is begonnen of voorbij. */
  past: boolean;
  /** Theokot is die (komende) namiddag dicht. */
  closed: boolean;
  /** De namiddag valt niet in de week na het evenement. */
  offWeek: boolean;
};

export type AfwasDayView = {
  /** `yyyy-mm-dd`. */
  key: string;
  /** "di 25 nov". */
  short: string;
  /** "dinsdag 25 november". */
  long: string;
  today: boolean;
  state: TheokotDayState;
  /** Waarom deze dag niet te boeken is; null = de uren die nog moeten komen, zijn te boeken. */
  block: AfwasBlock | null;
  /** De drie uren van de namiddag. */
  hours: AfwasHourView[];
};

export type AfwasHourView = {
  hour: number;
  /** "14:00–15:00". */
  label: string;
  /** Het uur is begonnen of voorbij. */
  past: boolean;
  entry: AfwasEntryView | null;
};

export type AfwasWeekView = { key: string; title: string; range: string; days: AfwasDayView[] };

type GroupType = "PRAESIDIUM" | "WERKGROEP" | "JAARWERKING";

const GROUP_TYPES: { type: GroupType; nl: string; en: string }[] = [
  { type: "PRAESIDIUM", nl: "Posten", en: "Posts" },
  { type: "WERKGROEP", nl: "Werkgroepen", en: "Working groups" },
  { type: "JAARWERKING", nl: "Jaarwerkingen", en: "Year teams" },
];

type Props = {
  nl: boolean;
  weeks: AfwasWeekView[];
  outstanding: AfwasEntryView[];
  recentlyWashed: AfwasEntryView[];
  /** "14:00–16:00". */
  slotLabel: string;
  /** De shift uit het sjabloon waar dat uur van komt. */
  slotShift: string | null;
  groups: { id: string; name: string; type: GroupType }[];
  defaultGroupId: string;
  kinds: { value: string; label: string }[];
  manage: boolean;
  nav: { previous: string; next: string; today: string | null; label: string };
};

/**
 * Het venster: een vrije namiddag aangeklikt (`day`), noteren zonder namiddag
 * (geen `day`), of een namiddag kiezen voor een regel die er al staat (`entry`).
 */
type DialogTarget = { day: AfwasDayView | null; hour: number | null; entry: AfwasEntryView | null };

export function AfwasPlanner(props: Props) {
  const { nl, weeks, outstanding, recentlyWashed, slotLabel, slotShift, groups, manage, nav } = props;
  const [target, setTarget] = useState<DialogTarget | null>(null);
  // De regel waarvoor het raster nu een namiddag laat kiezen; null = gewoon boeken.
  const [picking, setPicking] = useState<AfwasEntryView | null>(null);
  const planRef = useRef<HTMLElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const canAdd = groups.length > 0;

  function startPicking(entry: AfwasEntryView) {
    setPicking(entry);
    planRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // De focus naar de uitleg boven het raster, zodat een toetsenbord en een
  // screenreader meteen horen wat er nu van hen verwacht wordt.
  useEffect(() => {
    if (picking) bannerRef.current?.focus({ preventScroll: true });
  }, [picking]);

  return (
    <div className="tk-aw">
      <section className="tk-aw-section" aria-labelledby="tk-aw-todo-title">
        <div className="tk-aw-section-head">
          <h2 id="tk-aw-todo-title">{nl ? "Nog af te wassen" : "Still to wash"}</h2>
          {canAdd ? (
            <Button type="button" size="sm" onClick={() => setTarget({ day: null, hour: null, entry: null })}>
              {nl ? "Afwas noteren" : "Add washing up"}
            </Button>
          ) : null}
        </div>
        {outstanding.length === 0 ? (
          <p className="tk-aw-empty">{nl ? "Niemand moet nog afwassen." : "Nobody has anything left to wash."}</p>
        ) : (
          <EntryTable entries={outstanding} nl={nl} onPick={startPicking} />
        )}
      </section>

      <section ref={planRef} className="tk-aw-section tk-aw-plan" aria-labelledby="tk-aw-plan-title">
        <div className="tk-aw-section-head">
          <h2 id="tk-aw-plan-title">{nl ? "Namiddagen" : "Afternoons"}</h2>
          <span className="tk-aw-hours">
            {nl ? "Elke werkdag drie uren," : "Every weekday three hours,"} <strong>{slotLabel}</strong>
            {slotShift
              ? nl
                ? `, vanaf het begin van de shift ${slotShift}. Eén groep per uur.`
                : `, from the start of the shift ${slotShift}. One team per hour.`
              : nl
                ? ". Eén groep per uur."
                : ". One team per hour."}
          </span>
        </div>
        {picking ? (
          <div ref={bannerRef} className="tk-aw-picking" tabIndex={-1} role="status">
            <span>
              {nl ? "Kies een vrije namiddag voor " : "Pick a free afternoon for "}
              <strong>{picking.groupName}</strong>: {picking.what}
              {picking.weekAfterKey
                ? nl
                  ? ". De week na het evenement is aangeduid."
                  : ". The week after the event is marked."
                : "."}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(null)}>
              {nl ? "Stoppen" : "Stop"}
            </Button>
          </div>
        ) : null}
        <div className="tk-aw-nav">
          <IconLink href={nav.previous} label={nl ? "Vorige weken" : "Previous weeks"}>
            <ChevronLeft aria-hidden="true" size={16} />
          </IconLink>
          <span className="tk-aw-nav-label">{nav.label}</span>
          <IconLink href={nav.next} label={nl ? "Volgende weken" : "Next weeks"}>
            <ChevronRight aria-hidden="true" size={16} />
          </IconLink>
          {nav.today ? (
            <Link href={nav.today} className="tk-aw-today">
              {nl ? "Naar deze week" : "To this week"}
            </Link>
          ) : null}
        </div>
        <div className="tk-aw-weeks">
          {weeks.map((week) => (
            <div
              key={week.key}
              className="tk-aw-week"
              role="group"
              aria-labelledby={`tk-aw-week-${week.key}`}
              data-suggested={picking && picking.weekAfterKey === week.key ? "true" : undefined}
            >
              <h3 id={`tk-aw-week-${week.key}`} className="tk-aw-week-title">
                <span>{week.title}</span>
                <span className="tk-aw-week-range">{week.range}</span>
                {picking && picking.weekAfterKey === week.key ? (
                  <span className="tk-aw-week-hint">{nl ? "Week na het evenement" : "Week after the event"}</span>
                ) : null}
              </h3>
              <ul className="tk-aw-days">
                {week.days.map((day) => (
                  <li key={day.key}>
                    <DayCell
                      day={day}
                      nl={nl}
                      canBook={canAdd}
                      picking={picking}
                      onBook={(hour) => setTarget({ day, hour, entry: picking })}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {recentlyWashed.length > 0 ? (
        <section className="tk-aw-section" aria-labelledby="tk-aw-done-title">
          <h2 id="tk-aw-done-title" className="tk-aw-small-title">
            {nl ? "Onlangs afgevinkt" : "Recently ticked off"}
          </h2>
          <ul className="tk-aw-done">
            {recentlyWashed.map((entry) => (
              <li key={entry.id}>
                <span className="tk-aw-done-group">{entry.groupName}</span>
                <span>{entry.what}</span>
                {entry.dayLabel ? <span className="tk-aw-muted">{entry.dayLabel}</span> : null}
                {entry.washedBy ? (
                  <span className="tk-aw-muted">
                    {nl ? "afgevinkt door" : "ticked off by"} {entry.washedBy}
                  </span>
                ) : null}
                {entry.canToggle ? <WashedToggle entry={entry} nl={nl} /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="tk-aw-legend">
        <p>
          {nl
            ? "Brachten jullie na een evenement vuile bekers, glazen of kommetjes naar de loods? Noteer wat en hoeveel, en boek een namiddag in de week na het evenement: Logistiek brengt alles op maandag naar Theokot en haalt het de maandag erop terug. Wassen jullie af op het evenement zelf, dan hoef je niets in te vullen."
            : "Did your team bring dirty cups, glasses or bowls back to the warehouse after an event? Note what and how much, and book an afternoon in the week after the event: Logistics brings everything to Theokot on Monday and collects it the following Monday. If you wash up at the event itself, there is nothing to fill in."}
        </p>
        <p>
          {nl
            ? "Een namiddag staat op dicht zodra Theokot de verkoopweek online zet zonder die dag. Staat er voor een week nog niets online, dan kan je gewoon boeken; blijkt Theokot die dag toch dicht, dan krijgen de leden van je groep een mail."
            : "An afternoon shows as closed once Theokot puts the sales week online without that day. If nothing is online for a week yet, you can book anyway; if Theokot turns out to be closed that day, the members of your team get an email."}
          {manage
            ? nl
              ? " Annuleer je als Theokot of Logistiek de afwas van een andere groep, laat het hen dan zelf weten: er vertrekt geen mail."
              : " If you cancel another team's washing up as Theokot or Logistics, tell them yourself: no email is sent."
            : null}
        </p>
      </div>

      <AfwasDialog
        {...props}
        target={target}
        outstanding={outstanding}
        onClose={() => setTarget(null)}
        onSaved={() => setPicking(null)}
      />
    </div>
  );
}

/** De lijst "nog af te wassen", met de kolommen van de Excel. */
function EntryTable({
  entries,
  nl,
  onPick,
}: {
  entries: AfwasEntryView[];
  nl: boolean;
  onPick: (entry: AfwasEntryView) => void;
}) {
  return (
    <div className="tk-aw-table-wrap">
      <table className="tk-aw-table">
        <thead>
          <tr>
            <th scope="col">{nl ? "Groep" : "Team"}</th>
            <th scope="col">{nl ? "Wat" : "What"}</th>
            <th scope="col">{nl ? "Evenement" : "Event"}</th>
            <th scope="col">{nl ? "Namiddag" : "Afternoon"}</th>
            <th scope="col">
              <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} data-own={entry.own ? "true" : undefined}>
              <td data-label={nl ? "Groep" : "Team"} className="tk-aw-table-group">
                {entry.groupName}
              </td>
              <td data-label={nl ? "Wat" : "What"}>{entry.what}</td>
              <td data-label={nl ? "Evenement" : "Event"}>
                {entry.note || entry.eventLabel ? (
                  <>
                    {entry.note ? <span className="tk-aw-line">{entry.note}</span> : null}
                    {entry.eventLabel ? <span className="tk-aw-line tk-aw-muted">{entry.eventLabel}</span> : null}
                  </>
                ) : (
                  <span className="tk-aw-muted">{nl ? "Niet ingevuld" : "Not filled in"}</span>
                )}
              </td>
              <td data-label={nl ? "Namiddag" : "Afternoon"}>
                {entry.dayLabel ? (
                  <span className="tk-aw-line">{entry.dayLabel}</span>
                ) : (
                  <span className="tk-aw-line tk-aw-warn">{nl ? "Nog te kiezen" : "Still to pick"}</span>
                )}
                {entry.closed ? (
                  <span className="tk-aw-line tk-aw-warn">{nl ? "Theokot is dan dicht" : "Theokot is closed then"}</span>
                ) : null}
                {entry.offWeek ? (
                  <span className="tk-aw-line tk-aw-warn">{nl ? "Niet de week na het evenement" : "Not the week after the event"}</span>
                ) : null}
                {entry.past ? (
                  <span className="tk-aw-line tk-aw-warn">{nl ? "Voorbij, nog niet afgevinkt" : "Passed, not ticked off yet"}</span>
                ) : null}
              </td>
              <td data-row-action className="tk-aw-table-actions">
                <RowActions>
                  {entry.canPick ? (
                    <IconButton
                      label={entry.dayKey ? (nl ? "Namiddag wijzigen" : "Change afternoon") : nl ? "Namiddag kiezen" : "Pick afternoon"}
                      srLabel={`${entry.dayKey ? (nl ? "Namiddag wijzigen" : "Change afternoon") : nl ? "Namiddag kiezen" : "Pick afternoon"}: ${entry.groupName}, ${entry.what}`}
                      onClick={() => onPick(entry)}
                    >
                      <CalendarPlusIcon />
                    </IconButton>
                  ) : null}
                  {entry.canToggle ? <WashedToggle entry={entry} nl={nl} /> : null}
                  {entry.canCancel ? <CancelButton entry={entry} nl={nl} /> : null}
                </RowActions>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Afvinken of terugzetten; geen bevestiging, want "Onlangs afgevinkt" zet het terug. */
function WashedToggle({ entry, nl }: { entry: AfwasEntryView; nl: boolean }) {
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const washed = !entry.washed;
  const label = entry.washed
    ? nl
      ? "Terug op nog af te wassen"
      : "Back to still to wash"
    : nl
      ? "Afgewassen"
      : "Washed";

  function toggle() {
    const form = new FormData();
    form.set("id", entry.id);
    form.set("washed", String(washed));
    startTransition(async () => {
      const result = await unsentGuard.run(() => toggleAfwasWashedAction(form));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message:
            result.code === "NOT_YOUR_GROUP"
              ? nl
                ? "Je kan enkel de afwas van je eigen groep afvinken."
                : "You can only tick off your own team's washing up."
              : nl
                ? "Afvinken is mislukt. Probeer het opnieuw."
                : "Ticking off failed. Please try again.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: washed
          ? nl
            ? `Afgevinkt: ${entry.groupName}, ${entry.what}`
            : `Ticked off: ${entry.groupName}, ${entry.what}`
          : nl
            ? `Terug op de lijst: ${entry.groupName}, ${entry.what}`
            : `Back on the list: ${entry.groupName}, ${entry.what}`,
        variant: "success",
      });
    });
  }

  return (
    <IconButton label={label} srLabel={`${label}: ${entry.groupName}, ${entry.what}`} onClick={toggle} disabled={pending}>
      {entry.washed ? <UndoIcon /> : <CheckIcon />}
    </IconButton>
  );
}

function CancelButton({ entry, nl }: { entry: AfwasEntryView; nl: boolean }) {
  const when = entry.dayLabel ?? (nl ? "zonder namiddag" : "without an afternoon");
  const freed = entry.dayLabel
    ? nl
      ? " De namiddag komt vrij voor een andere groep."
      : " The afternoon becomes free for another team."
    : "";
  return (
    <DeleteIconButton
      action={cancelAfwasAction}
      fields={{ id: entry.id }}
      label={nl ? "Afwas annuleren" : "Cancel washing up"}
      srLabel={nl ? `Afwas annuleren: ${entry.groupName}, ${when}` : `Cancel washing up: ${entry.groupName}, ${when}`}
      title={nl ? "Afwas annuleren?" : "Cancel this washing up?"}
      description={
        entry.own
          ? nl
            ? `De regel "${entry.what}" van ${entry.groupName} (${when}) verdwijnt van de lijst.${freed} Er vertrekt geen mail.`
            : `The line "${entry.what}" for ${entry.groupName} (${when}) is removed from the list.${freed} No email is sent.`
          : nl
            ? `De regel "${entry.what}" van ${entry.groupName} (${when}) verdwijnt van de lijst.${freed} ${entry.groupName} krijgt hier geen mail over; laat het hen zelf weten.`
            : `The line "${entry.what}" for ${entry.groupName} (${when}) is removed from the list.${freed} ${entry.groupName} gets no email about this; tell them yourself.`
      }
      confirmLabel={nl ? "Annuleren" : "Cancel washing up"}
      cancelLabel={nl ? "Behouden" : "Keep"}
      successMessage={nl ? `Afwas van ${entry.groupName} geannuleerd` : `${entry.groupName}'s washing up cancelled`}
      errorMessages={{
        NOT_YOUR_GROUP: nl ? "Je kan enkel de afwas van je eigen groep annuleren." : "You can only cancel your own team's washing up.",
        PAST: nl
          ? "Deze namiddag is al begonnen; enkel Theokot of Logistiek kan ze nog weghalen."
          : "This afternoon has already started; only Theokot or Logistics can remove it now.",
        WASHED: nl
          ? "Deze afwas is al afgevinkt; enkel Theokot of Logistiek kan ze nog weghalen."
          : "This washing up is already ticked off; only Theokot or Logistics can remove it now.",
      }}
      errorFallback={nl ? "Annuleren is mislukt. Probeer het opnieuw." : "Cancelling failed. Please try again."}
    />
  );
}

function DayCell({
  day,
  nl,
  canBook,
  picking,
  onBook,
}: {
  day: AfwasDayView;
  nl: boolean;
  canBook: boolean;
  /** De regel waarvoor er nu uren gekozen worden. */
  picking: AfwasEntryView | null;
  onBook: (hour: number) => void;
}) {
  const date = (
    <span className="tk-aw-date">
      {day.short}
      {day.today ? <span className="tk-aw-today-pin">{nl ? "vandaag" : "today"}</span> : null}
    </span>
  );
  const anyBooked = day.hours.some((hour) => hour.entry);

  // Dicht en niets geboekt: een gestreepte dag, zonder uren.
  if (day.block === "closed" && !anyBooked) {
    return (
      <div className="tk-aw-cell" data-kind="closed" data-today={day.today ? "true" : undefined}>
        {date}
        <span className="tk-aw-closed">{nl ? "Theokot dicht" : "Theokot closed"}</span>
      </div>
    );
  }

  return (
    <div
      className="tk-aw-cell"
      data-kind={day.block === "past" ? "past" : "day"}
      data-closed={day.block === "closed" ? "true" : undefined}
      data-today={day.today ? "true" : undefined}
    >
      {date}
      {day.block === "closed" ? <span className="tk-aw-warn">{nl ? "Theokot is dan dicht" : "Theokot is closed then"}</span> : null}
      <ul className="tk-aw-hours-list">
        {day.hours.map((hour) => {
          if (hour.entry) {
            const entry = hour.entry;
            return (
              <li
                key={hour.hour}
                className="tk-aw-hour"
                data-kind="booked"
                data-own={entry.own ? "true" : undefined}
                data-past={hour.past ? "true" : undefined}
                title={`${entry.groupName}: ${entry.what}${entry.createdBy ? ` (${nl ? "door" : "by"} ${entry.createdBy})` : ""}`}
              >
                <span className="tk-aw-hour-time">{hour.label.split("–")[0]}</span>
                <span className="tk-aw-hour-group">
                  {entry.groupName}
                  {entry.washed ? <span className="tk-aw-ok"> · {nl ? "afgewassen" : "washed"}</span> : null}
                </span>
              </li>
            );
          }
          const bookable = !hour.past && day.block === null && (canBook || picking);
          if (!bookable) {
            return (
              <li key={hour.hour} className="tk-aw-hour" data-kind="unavailable">
                <span className="tk-aw-hour-time">{hour.label.split("–")[0]}</span>
                <span className="tk-aw-hour-free">{hour.past || day.block === "past" ? "" : nl ? "Vrij" : "Free"}</span>
              </li>
            );
          }
          return (
            <li key={hour.hour}>
              <button
                type="button"
                className="tk-aw-hour"
                data-kind="free"
                data-picking={picking ? "true" : undefined}
                onClick={() => onBook(hour.hour)}
                aria-label={
                  picking
                    ? nl
                      ? `${day.long}, ${hour.label} kiezen voor ${picking.groupName}`
                      : `Pick ${day.long}, ${hour.label} for ${picking.groupName}`
                    : nl
                      ? `Afwas inboeken op ${day.long}, ${hour.label}`
                      : `Book washing up on ${day.long}, ${hour.label}`
                }
              >
                <span className="tk-aw-hour-time">{hour.label.split("–")[0]}</span>
                <span className="tk-aw-book" aria-hidden="true">
                  {picking ? (nl ? "Kies" : "Pick") : `+ ${nl ? "Vrij" : "Free"}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ligt `dayKey` in de week na `eventKey`? Zelfde regel als `inWeekAfterEvent`. */
function inWeekAfter(eventKey: string | null, dayKey: string): boolean {
  const event = eventKey ? parseYMD(eventKey) : null;
  const day = parseYMD(dayKey);
  if (!event || !day) return true;
  const mondayOf = (ymd: NonNullable<typeof day>) => shiftYMD(ymd, 1 - isoWeekday(ymd));
  return ymdKey(mondayOf(day)) === ymdKey(shiftYMD(mondayOf(event), 7));
}

const NEW_ENTRY = "new";

function AfwasDialog({
  nl,
  target,
  outstanding,
  groups,
  defaultGroupId,
  kinds,
  onClose,
  onSaved,
}: Props & { target: DialogTarget | null; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const groupFieldId = useId();
  const quantityId = useId();
  const eventId = useId();
  const noteId = useId();
  const warnId = useId();

  const day = target?.day ?? null;
  // Een regel die er al stond: de groep en wat er af te wassen valt, liggen vast.
  const fixed = target?.entry ?? null;
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [choice, setChoice] = useState(NEW_ENTRY);
  const [eventDate, setEventDate] = useState("");
  const [hours, setHours] = useState<number[]>([]);

  // Wat er van de gekozen groep al op de lijst staat zonder namiddag: daar
  // kies je dan een namiddag voor, in plaats van een tweede regel te maken.
  const unplanned =
    day && !fixed ? outstanding.filter((entry) => entry.groupId === groupId && !entry.dayKey && entry.canPick) : [];
  const attached = fixed ?? unplanned.find((entry) => entry.id === choice) ?? null;

  // Elke keer dat het venster opengaat: de standaardgroep, een lege datum, en
  // de eerste open regel van die groep als die er is.
  const [openedFor, setOpenedFor] = useState<DialogTarget | null>(null);
  if (target && target !== openedFor) {
    setOpenedFor(target);
    setGroupId(defaultGroupId);
    setEventDate("");
    // Het aangeklikte uur, en bij verzetten op dezelfde dag de uren die er al stonden.
    const kept = target.entry && target.day && target.entry.dayKey === target.day.key ? target.entry.hours : [];
    setHours([...new Set([...(target.hour !== null ? [target.hour] : []), ...kept])].sort((a, b) => a - b));
    const first =
      target.day && !target.entry
        ? outstanding.find((entry) => entry.groupId === defaultGroupId && !entry.dayKey && entry.canPick)
        : undefined;
    setChoice(first?.id ?? NEW_ENTRY);
  }

  // Een echte <dialog> met showModal: de focus blijft erin, Escape sluit, en
  // de focus gaat na het sluiten terug naar de knop waarop geklikt werd.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  const close = () => ref.current?.close();

  // Welke uren van die dag je kan aanvinken: vrij en nog niet begonnen, plus de
  // eigen uren van de regel die je verzet.
  const choosable = day
    ? day.hours.filter((hour) => !hour.past && (hour.entry === null || (fixed !== null && hour.entry.id === fixed.id)))
    : [];

  const eventKey = attached ? attached.eventKey : eventDate || null;
  const offWeek = day !== null && eventKey !== null && !inWeekAfter(eventKey, day.key);

  return (
    <dialog
      ref={ref}
      className="tk-aw-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // Een klik op de achtergrond (buiten het venster) sluit.
        if (event.target === ref.current) close();
      }}
    >
      {target ? (
        <div className="tk-aw-dialog-body">
          <div className="tk-aw-dialog-head">
            <h2 id={titleId}>
              {fixed
                ? fixed.dayKey
                  ? nl
                    ? "Namiddag wijzigen"
                    : "Change afternoon"
                  : nl
                    ? "Namiddag kiezen"
                    : "Pick afternoon"
                : day
                  ? nl
                    ? "Afwas inboeken"
                    : "Book washing up"
                  : nl
                    ? "Afwas noteren"
                    : "Add washing up"}
            </h2>
            <IconButton label={nl ? "Sluiten" : "Close"} onClick={close}>
              <CloseIcon />
            </IconButton>
          </div>
          <div className="tk-aw-dialog-when">
            {day ? (
              <>
                <strong>{day.long}</strong> · Theokot
              </>
            ) : nl ? (
              "De namiddag kiest de groep later, met \u201cNamiddag kiezen\u201d in de lijst. Noteer je dit voor een groep waar je zelf niet in zit, dan krijgen haar leden meteen een mail, en na twee dagen zonder namiddag nog een herinnering."
            ) : (
              "The team picks the afternoon later, with \u201cPick afternoon\u201d in the list. If you add this for a team you are not in, its members get an email right away, and a reminder after two days without an afternoon."
            )}
          </div>
          <SaveForm
            key={`${day?.key ?? "none"}`}
            action={saveAfwasAction}
            disableAutoTranslate
            submitLabel={fixed ? (nl ? "Kies deze uren" : "Pick these hours") : day ? (nl ? "Inboeken" : "Book") : nl ? "Noteren" : "Add"}
            savingLabel={nl ? "Bezig met opslaan…" : "Saving…"}
            savedMessage={
              fixed && day
                ? fixed.dayKey
                  ? nl
                    ? `Namiddag verzet naar ${day.long}`
                    : `Afternoon moved to ${day.long}`
                  : nl
                    ? `Namiddag gekozen: ${day.long}`
                    : `Afternoon picked: ${day.long}`
                : day
                ? nl
                  ? `Afwas geboekt op ${day.long}`
                  : `Washing up booked on ${day.long}`
                : nl
                  ? "Afwas genoteerd"
                  : "Washing up added"
            }
            errorMessages={{
              TAKEN: nl
                ? "Een van die uren is intussen geboekt door een andere groep. Kies een ander uur."
                : "One of those hours was just booked by another team. Pick another hour.",
              CLOSED: nl ? "Theokot is die dag niet open. Kies een andere namiddag." : "Theokot is closed that day. Pick another afternoon.",
              PAST: nl ? "Een van die uren is al begonnen of voorbij." : "One of those hours has already started or passed.",
              WEEKEND: nl ? "Theokot is enkel op weekdagen open." : "Theokot is only open on weekdays.",
              TOO_FAR: nl ? "Je kan hoogstens een jaar vooruit boeken." : "You can book at most a year ahead.",
              NOT_YOUR_GROUP: nl
                ? "Je kan enkel iets noteren voor een groep waar je dit werkingsjaar in zit."
                : "You can only add something for a team you are in this working year.",
              UNKNOWN_GROUP: nl ? "Die groep bestaat niet meer." : "That team no longer exists.",
              INVALID_DAY: nl ? "Dat is geen geldige dag." : "That is not a valid day.",
              KINDS_REQUIRED: nl ? "Duid aan wat er afgewassen moet worden." : "Choose what needs washing.",
              QUANTITY_REQUIRED: nl ? "Vul in hoeveel er af te wassen valt." : "Fill in how much there is to wash.",
              QUANTITY_TOO_LONG: nl ? "Hou de hoeveelheid kort, bv. \"3 bakken\"." : "Keep the amount short, e.g. \"3 crates\".",
              EVENT_DATE_REQUIRED: nl ? "Vul de datum van het evenement in." : "Fill in the date of the event.",
              INVALID_EVENT_DATE: nl ? "Dat is geen geldige datum voor het evenement." : "That is not a valid event date.",
              NOTE_TOO_LONG: nl ? "Hou het bij 200 tekens." : "Keep it under 200 characters.",
              WASHED: nl ? "Die afwas is intussen afgevinkt." : "That washing up has been ticked off in the meantime.",
              HOURS_REQUIRED: nl ? "Vink minstens één uur aan." : "Tick at least one hour.",
              NOT_FOUND: nl ? "Die afwas staat niet meer op de lijst." : "That washing up is no longer on the list.",
            }}
            fallbackErrorMessage={nl ? "Opslaan is mislukt. Probeer het opnieuw." : "Saving failed. Please try again."}
            onSuccess={() => {
              onSaved();
              close();
            }}
            className="tk-aw-form"
            footer={({ submitButton, confirmDialog }) => (
              <>
                <div className="tk-aw-dialog-actions">
                  <Button type="button" variant="ghost" onClick={close}>
                    {nl ? "Annuleren" : "Cancel"}
                  </Button>
                  {submitButton}
                </div>
                {confirmDialog}
              </>
            )}
          >
            {day ? (
              <>
                <input type="hidden" name="day" value={day.key} />
                <fieldset className="tk-aw-fieldset">
                  <legend>{nl ? "Welke uren?" : "Which hours?"}</legend>
                  <div className="tk-aw-kinds">
                    {choosable.map((hour) => (
                      <label key={hour.hour} className="tk-aw-choice">
                        <input
                          type="checkbox"
                          name="hours"
                          value={hour.hour}
                          checked={hours.includes(hour.hour)}
                          onChange={(event) =>
                            setHours((current) =>
                              event.target.checked
                                ? [...current, hour.hour].sort((a, b) => a - b)
                                : current.filter((value) => value !== hour.hour),
                            )
                          }
                        />
                        <span>{hour.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}

            {fixed ? (
              <div className="tk-aw-for">
                {nl ? "Voor" : "For"} <strong>{fixed.groupName}</strong>: {fixed.what}
                {fixed.dayLabel ? (
                  <span className="tk-aw-muted">
                    {" "}
                    ({nl ? "nu" : "now"} {fixed.dayLabel})
                  </span>
                ) : null}
              </div>
            ) : groups.length === 1 ? (
              <>
                <input type="hidden" name="groupId" value={groups[0].id} />
                <div className="tk-aw-for">
                  {nl ? "Voor" : "For"} <strong>{groups[0].name}</strong>
                </div>
              </>
            ) : (
              <div>
                <Label htmlFor={groupFieldId}>{nl ? "Voor welke groep?" : "For which team?"}</Label>
                <Select
                  id={groupFieldId}
                  name="groupId"
                  value={groupId}
                  onChange={(event) => {
                    setGroupId(event.target.value);
                    const first = day
                      ? outstanding.find((entry) => entry.groupId === event.target.value && !entry.dayKey && entry.canPick)
                      : undefined;
                    setChoice(first?.id ?? NEW_ENTRY);
                  }}
                  required
                >
                  {/* Per soort: Theokot en Logistiek kiezen uit elke groep van de kring. */}
                  {GROUP_TYPES.map(({ type, nl: labelNl, en: labelEn }) => {
                    const ofType = groups.filter((group) => group.type === type);
                    if (ofType.length === 0) return null;
                    return (
                      <optgroup key={type} label={nl ? labelNl : labelEn}>
                        {ofType.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </div>
            )}

            {unplanned.length > 0 ? (
              <fieldset className="tk-aw-fieldset">
                <legend>{nl ? "Wat komen jullie afwassen?" : "What are you washing?"}</legend>
                {unplanned.map((entry) => (
                  <label key={entry.id} className="tk-aw-choice">
                    <input
                      type="radio"
                      name="entryChoice"
                      value={entry.id}
                      checked={choice === entry.id}
                      onChange={() => setChoice(entry.id)}
                    />
                    <span>
                      {entry.what}
                      {entry.note ? <span className="tk-aw-muted"> · {entry.note}</span> : null}
                      <span className="tk-aw-muted"> · {nl ? "staat al op de lijst" : "already on the list"}</span>
                    </span>
                  </label>
                ))}
                <label className="tk-aw-choice">
                  <input
                    type="radio"
                    name="entryChoice"
                    value={NEW_ENTRY}
                    checked={choice === NEW_ENTRY}
                    onChange={() => setChoice(NEW_ENTRY)}
                  />
                  <span>{nl ? "Iets nieuws" : "Something new"}</span>
                </label>
              </fieldset>
            ) : null}

            {attached ? (
              <input type="hidden" name="entryId" value={attached.id} />
            ) : (
              <>
                <fieldset className="tk-aw-fieldset">
                  <legend>{nl ? "Wat moet er afgewassen worden?" : "What needs washing?"}</legend>
                  <div className="tk-aw-kinds">
                    {kinds.map((kind) => (
                      <label key={kind.value} className="tk-aw-choice">
                        <input type="checkbox" name="kinds" value={kind.value} />
                        <span>{kind.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <Label htmlFor={quantityId}>{nl ? "Hoeveel?" : "How much?"}</Label>
                  <Input
                    id={quantityId}
                    name="quantity"
                    required
                    maxLength={120}
                    autoComplete="off"
                    placeholder={nl ? "3 bakken, 100 cavaglazen" : "3 crates, 100 champagne glasses"}
                  />
                </div>
                <div className="tk-aw-row">
                  <div>
                    <Label htmlFor={eventId}>
                      {day ? (nl ? "Datum van het evenement" : "Date of the event") : nl ? "Datum van het evenement (optioneel)" : "Date of the event (optional)"}
                    </Label>
                    <Input
                      id={eventId}
                      name="eventDate"
                      type="date"
                      required={day !== null}
                      value={eventDate}
                      onChange={(event) => setEventDate(event.target.value)}
                      aria-describedby={offWeek ? warnId : undefined}
                    />
                  </div>
                  <div>
                    <Label htmlFor={noteId}>{nl ? "Welk evenement? (optioneel)" : "Which event? (optional)"}</Label>
                    <Input
                      id={noteId}
                      name="note"
                      maxLength={200}
                      autoComplete="off"
                      placeholder={nl ? "Cantus" : "Cantus"}
                    />
                  </div>
                </div>
              </>
            )}

            <div id={warnId} role="status" className="tk-aw-dialog-warn">
              {offWeek && eventKey
                ? nl
                  ? `Let op: dit is niet de week na het evenement (de week van ${weekStartLabel(eventKey, nl)}). Logistiek brengt de vuile bekers op de maandag na het evenement naar Theokot en haalt ze de maandag daarna terug. Boeken kan wel.`
                  : `Note: this is not the week after the event (the week of ${weekStartLabel(eventKey, nl)}). Logistics brings the dirty cups to Theokot on the Monday after the event and collects them the Monday after that. You can still book.`
                : null}
            </div>
          </SaveForm>
        </div>
      ) : null}
    </dialog>
  );
}

/** "ma 1 dec": de maandag van de week na het evenement. */
function weekStartLabel(eventKey: string, nl: boolean): string {
  const event = parseYMD(eventKey);
  if (!event) return "";
  const monday = shiftYMD(event, 1 - isoWeekday(event) + 7);
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(Date.UTC(monday.year, monday.month - 1, monday.day, 12)))
    .replace(/\./g, "");
}
