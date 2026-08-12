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
  visibility?: "PUBLIC" | "MEMBERS";
  url?: string | null;
  imageKey?: string | null;
  categoryIds?: string[];
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

export function EventForm({
  event,
  groups,
  categories,
  locale,
  canCreateTickets = false,
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
}) {
  const nl = locale === "nl";
  const selected = new Set(event.categoryIds ?? []);
  const audienceCategories = categories.filter((c) => c.audience !== null);
  const themeCategories = categories.filter((c) => c.audience === null);
  return (
    <SaveForm
      action={saveEventAction}
      className="space-y-4"
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Evenement opgeslagen" : "Event saved"}
      errorMessages={{
        ...saveErrorMessages(locale),
        END_BEFORE_START: nl
          ? "Niet opgeslagen: het einde ligt voor de start. Kies een einde na de startdatum."
          : "Not saved: the end is before the start. Pick an end after the start date.",
      }}
      fallbackErrorMessage={nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving."}
      secondarySubmit={
        canCreateTickets && !event.id
          ? {
              name: "andThen",
              value: "tickets",
              label: nl ? "Opslaan en tickets toevoegen" : "Save and add tickets",
            }
          : undefined
      }
    >
      {event.id && <input type="hidden" name="id" value={event.id} />}
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
            <div>
              <Label>Visibility</Label>
              <Select name="visibility" defaultValue={event.visibility ?? "PUBLIC"}>
                <option value="PUBLIC">Public</option>
                <option value="MEMBERS">Members only</option>
              </Select>
            </div>
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
                ? "Laat leeg voor een event voor iedereen. Duid je een doelgroep aan, dan verschijnt het event vanzelf bij die leden en staat het bij de anderen pas onder “ook andere doelgroepen”."
                : "Leave empty for an event for everyone. Pick an audience and the event surfaces automatically for those members, while others only see it under “other audiences too”."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {audienceCategories.map((c) => (
                <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
              ))}
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
              {themeCategories.map((c) => (
                <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
              ))}
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
