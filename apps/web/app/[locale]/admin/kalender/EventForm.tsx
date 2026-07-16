import { Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { saveEventAction } from "@/app/actions/calendar";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { EventImageField } from "./EventImageField";

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
};

type Group = { id: string; nameNl: string; nameEn: string };

function toLocalDatetime(d?: Date | null | string) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventForm({
  event,
  groups,
  locale,
}: {
  event: Event;
  groups: Group[];
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
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
              <option value="" disabled>—</option>
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
        </div>
        <div>
          <Label>Description (NL)</Label>
          <Textarea name="descriptionNl" defaultValue={event.descriptionNl ?? ""} rows={3} />
        </div>
        <div>
          <Label>Description (EN)</Label>
          <Textarea name="descriptionEn" defaultValue={event.descriptionEn ?? ""} rows={3} />
        </div>
      </Card>
    </SaveForm>
  );
}
