import Link from "next/link";
import { Card, Input, Label, Select } from "@vtk/ui";
import { saveEventAction } from "@/app/actions/calendar";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { EventImageField } from "./EventImageField";
import { utcToLocalDateTime } from "@/lib/ticketing/time";

type Event = {
  id?: string;
  titleNl?: string;
  titleEn?: string | null;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
  location?: string | null;
  groupId?: string;
  start?: Date | null;
  end?: Date | null;
  allDay?: boolean;
  url?: string | null;
  imageKey?: string | null;
  publishedAt?: Date | null;
  categoryIds?: string[];
  /** Hangt er al een logistiek-evenement aan? Zie `UitleenEvent.calendarEventId`. */
  hasUitleenEvent?: boolean;
};

type Group = { id: string; nameNl: string; nameEn: string };
type Category = {
  id: string;
  nameNl: string;
  nameEn: string;
  colour: string;
  audience: string | null;
};

function toLocalDatetime(d?: Date | null | string) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return utcToLocalDateTime(date);
}

/** Eén aanvinkbare categorie; doelgroep en thema gebruiken dezelfde `name`. */
function CategoryCheckbox({
  category,
  checked,
  nl,
}: {
  category: Category;
  checked: boolean;
  nl: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" name="categoryIds" value={category.id} defaultChecked={checked} />
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full"
        style={{ background: category.colour }}
      />
      {nl ? category.nameNl : category.nameEn}
    </label>
  );
}

function EmptyCategoryMessage({
  audience,
  nl,
  canManageCategories,
  base,
}: {
  audience: boolean;
  nl: boolean;
  canManageCategories: boolean;
  base: string;
}) {
  return (
    <p className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/50 px-3 py-2 text-sm text-vtk-blue-muted">
      {audience
        ? nl
          ? "Er zijn nog geen doelgroepen ingesteld. Dit evenement is voorlopig voor iedereen."
          : "No audiences have been configured yet. This event is for everyone for now."
        : nl
          ? "Er zijn nog geen categorieën ingesteld. Dit evenement wordt zonder categorie opgeslagen."
          : "No categories have been configured yet. This event will be saved without a category."}{" "}
      {canManageCategories ? (
        <Link href={`${base}/admin/kalender/categorieen`} className="font-medium text-vtk-ink hover:underline">
          {nl ? "Categorieën instellen" : "Configure categories"}
        </Link>
      ) : null}
    </p>
  );
}

export function EventForm({
  event,
  groups,
  categories,
  locale,
  canCreateTickets = false,
  canManageCategories = false,
}: {
  event: Event;
  groups: Group[];
  categories: Category[];
  locale: "nl" | "en";
  /**
   * Toont "Opslaan en tickets toevoegen" bij een nieuw evenement. Ticketevents
   * aanmaken is een aparte permissie, dus wie enkel mag inplannen ziet die knop
   * niet.
   */
  canCreateTickets?: boolean;
  /** Geeft bij een lege keuzelijst een rechtstreekse link naar categoriebeheer. */
  canManageCategories?: boolean;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const selected = new Set(event.categoryIds ?? []);
  const audienceCategories = categories.filter((c) => c.audience !== null);
  const themeCategories = categories.filter((c) => c.audience === null);
  const isDraft = Boolean(event.id) && !event.publishedAt;
  const isPublished = Boolean(event.id) && Boolean(event.publishedAt);
  const secondarySubmits = [
    ...(!event.id || isDraft
      ? [
          {
            name: "publication",
            value: "draft",
            label: nl ? "Opslaan als concept" : "Save as draft",
          },
        ]
      : []),
    // Een gepubliceerd evenement terug offline halen. Dezelfde knop en dezelfde
    // waarde als hierboven, maar met een andere naam en een bevestiging: dit
    // haalt iets weg dat bezoekers nu zien, en dat verdient een vraag.
    ...(isPublished
      ? [
          {
            name: "publication",
            value: "draft",
            label: nl ? "Terug naar concept" : "Back to draft",
            confirm: {
              title: nl ? "Terug naar concept?" : "Back to draft?",
              description: nl
                ? "Het evenement verdwijnt meteen van de kalender, de homepage, de agenda-feeds en de app. De inhoud, categorieën, tickets en het formulier blijven bewaard; publiceren zet alles in één klik terug online."
                : "The event disappears at once from the calendar, the home page, the calendar feeds and the app. Its content, categories, tickets and form are kept; publishing puts everything back online in one click.",
              confirmLabel: nl ? "Terug naar concept" : "Back to draft",
              cancelLabel: nl ? "Annuleren" : "Cancel",
            },
          },
        ]
      : []),
    ...(canCreateTickets && !event.id
      ? [
          {
            name: "andThen",
            value: "tickets",
            label: nl ? "Publiceren en tickets toevoegen" : "Publish and add tickets",
          },
        ]
      : []),
  ];

  return (
    <SaveForm
      action={saveEventAction}
      className="space-y-4"
      submitLabel={
        !event.id || isDraft
          ? nl
            ? "Publiceren"
            : "Publish"
          : nl
            ? "Wijzigingen opslaan"
            : "Save changes"
      }
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Evenement opgeslagen" : "Event saved"}
      errorMessages={{
        ...saveErrorMessages(locale),
        END_BEFORE_START: nl
          ? "Niet opgeslagen: het einde ligt voor de start. Kies een einde na de startdatum."
          : "Not saved: the end is before the start. Pick an end after the start date.",
      }}
      fallbackErrorMessage={nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving."}
      secondarySubmit={secondarySubmits.length > 0 ? secondarySubmits : undefined}
    >
      {event.id && <input type="hidden" name="id" value={event.id} />}
      {isDraft ? (
        <div
          className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/60 px-4 py-3 text-sm text-vtk-ink"
          role="status"
        >
          <strong>{nl ? "Dit evenement is een concept." : "This event is a draft."}</strong>{" "}
          {nl
            ? "Het staat nog nergens online. Klik op Publiceren wanneer het klaar is."
            : "It is not visible anywhere online yet. Click Publish when it is ready."}
        </div>
      ) : null}
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Title (NL)</Label>
            <Input name="titleNl" defaultValue={event.titleNl ?? ""} required />
          </div>
          <div>
            <Label>Title (EN)</Label>
            <Input name="titleEn" defaultValue={event.titleEn ?? ""} />
          </div>
          <div>
            <Label>{locale === "nl" ? "Groep" : "Group"}</Label>
            <Select name="groupId" defaultValue={event.groupId ?? ""} required>
              <option value="" disabled>{nl ? "Kies een groep" : "Choose a group"}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {locale === "nl" ? g.nameNl : g.nameEn}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{locale === "nl" ? "Locatie" : "Location"}</Label>
            <Input name="location" defaultValue={event.location ?? ""} />
          </div>
          <div>
            <Label>Start</Label>
            <Input name="start" type="datetime-local" defaultValue={toLocalDatetime(event.start)} required />
          </div>
          <div>
            <Label>{locale === "nl" ? "Einde" : "End"}</Label>
            <Input name="end" type="datetime-local" defaultValue={toLocalDatetime(event.end)} required />
          </div>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="allDay" defaultChecked={event.allDay ?? false} />
              {locale === "nl" ? "Hele dag" : "All day"}
            </label>
          </div>
          {/* E1: hiermee verschijnt dit evenement ook op logistiek.vtk.be, zodat
              materiaal, flesserke en transport eronder gegroepeerd kunnen worden.
              Standaard aan bij een nieuw evenement; wie het uitlaat, krijgt daar
              niets. Uitzetten koppelt niets los, want er kunnen al aanvragen aan
              hangen. */}
          <div className="md:col-span-2">
            <label className="inline-flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="needsLogistics"
                defaultChecked={event.id ? (event.hasUitleenEvent ?? false) : true}
                className="mt-1"
              />
              <span>
                {nl ? "Logistiek nodig" : "Needs logistics"}
                <span className="mt-0.5 block text-vtk-blue-muted">
                  {nl
                    ? event.hasUitleenEvent
                      ? "Dit evenement staat op logistiek.vtk.be; naam, locatie en uren volgen hier mee. Het vinkje weghalen laat het daar staan, want er kunnen al aanvragen aan hangen."
                      : "Zet dit evenement ook op logistiek.vtk.be, zodat materiaal, flesserke en transport eronder samen komen te staan."
                    : event.hasUitleenEvent
                      ? "This event exists on logistiek.vtk.be; its name, location and times follow this one. Unticking leaves it there, since requests may already be attached."
                      : "Also put this event on logistiek.vtk.be, so equipment, drinks and transport end up together."}
                </span>
              </span>
            </label>
          </div>
          <div>
            <Label>URL</Label>
            <Input name="url" defaultValue={event.url ?? ""} placeholder="https://..." />
          </div>
          <div className="md:col-span-2">
            <EventImageField defaultKey={event.imageKey} locale={locale} />
          </div>
          {/* Twee assen, bewust apart gezet. De doelgroep bepaalt wie het event
              vanzelf in zijn kalender krijgt; het thema is enkel een filter en
              een kleur. Ze staan in dezelfde koppeltabel, vandaar dezelfde
              `name`. */}
          <div className="md:col-span-2">
            <Label>{nl ? "Doelgroep" : "Audience"}</Label>
            <p className="mb-2 text-sm text-vtk-blue-muted">
              {nl
                ? "Laat leeg voor een algemeen event. Met een doelgroep blijft het event voor iedereen zichtbaar, maar bezoekers kunnen erop filteren of hun kalender op hun profiel afstemmen."
                : "Leave empty for a general event. With a target audience it remains visible to everyone, while visitors can filter by it or tailor the calendar to their profile."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {audienceCategories.length > 0 ? (
                audienceCategories.map((c) => (
                  <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
                ))
              ) : (
                <EmptyCategoryMessage
                  audience
                  nl={nl}
                  canManageCategories={canManageCategories}
                  base={base}
                />
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>{nl ? "Categorieën" : "Categories"}</Label>
            <p className="mb-2 text-sm text-vtk-blue-muted">
              {nl
                ? "Het thema van het event. Bepaalt de kleur in de kalender, de filterknop en de agenda-feed per categorie."
                : "The event's theme. Determines its colour in the calendar, the filter button and the per-category calendar feed."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {themeCategories.length > 0 ? (
                themeCategories.map((c) => (
                  <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
                ))
              ) : (
                <EmptyCategoryMessage
                  audience={false}
                  nl={nl}
                  canManageCategories={canManageCategories}
                  base={base}
                />
              )}
            </div>
          </div>
        </div>
        <div>
          <Label htmlFor="calendar-description-nl">Description (NL)</Label>
          <MarkdownEditorField
            name="descriptionNl"
            defaultValue={event.descriptionNl}
            locale={locale}
            rows={8}
            textareaId="calendar-description-nl"
          />
        </div>
        <div>
          <Label htmlFor="calendar-description-en">Description (EN)</Label>
          <MarkdownEditorField
            name="descriptionEn"
            defaultValue={event.descriptionEn}
            locale={locale}
            rows={8}
            textareaId="calendar-description-en"
          />
        </div>
      </Card>
    </SaveForm>
  );
}
