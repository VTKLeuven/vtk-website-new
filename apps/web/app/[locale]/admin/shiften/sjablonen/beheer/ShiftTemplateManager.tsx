'use client';

import { useMemo, useState } from 'react';
import type { Locale } from '@vtk/i18n';
import { Button, Card, Input, Label, Select, Textarea } from '@vtk/ui';
import { DeleteButton } from '@/components/ui/DeleteIconButton';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { SaveForm } from '@/components/ui/SaveForm';
import { saveErrorMessages } from '@/lib/saveMessages';
import {
  INHERIT_POST,
  NO_POST,
  composeName,
  formatTemplateDuration,
  formatTemplateOffset,
  templateClockAt,
  templateTimeOfDay,
  toDraftEntry,
  type ShiftTemplate,
  type ShiftTemplateDraftEntry,
} from '@/lib/shift/templates';
import { deleteShiftTemplateAction, saveShiftTemplateAction } from '@/app/actions/shiftTemplates';

// -----------------------------------------------------------------------------

type Draft = ShiftTemplateDraftEntry & { uid: string };

let uidCounter = 0;
const nextUid = () => `row-${(uidCounter += 1)}`;

/** De rijen zoals de server action ze leest: zonder de React-sleutel. */
function toPayload(rows: Draft[]): ShiftTemplateDraftEntry[] {
  return rows.map((row) => ({
    name: row.name,
    startOffsetMinutes: row.startOffsetMinutes,
    durationMinutes: row.durationMinutes,
    maxParticipants: row.maxParticipants,
    reward: row.reward,
    description: row.description,
    instructions: row.instructions,
    location: row.location,
    post: row.post,
    openToInternationals: row.openToInternationals,
    enabled: row.enabled,
  }));
}

function blankEntry(): Draft {
  return {
    uid: nextUid(),
    name: '',
    startOffsetMinutes: 0,
    durationMinutes: 120,
    maxParticipants: 2,
    reward: 1,
    description: '',
    instructions: '',
    location: '',
    post: INHERIT_POST,
    openToInternationals: false,
    enabled: true,
  };
}

/** Wat er in het formulier staat wanneer je op "Nieuw sjabloon" klikt. */
function blankTemplate(): ShiftTemplate {
  return {
    id: '',
    slug: '',
    label: '',
    note: null,
    builtIn: false,
    eventName: '',
    location: '',
    post: null,
    timeOfDay: '20:00',
    shifts: [],
  };
}

export function ShiftTemplateManager({
  locale,
  templates,
  postOptions,
}: {
  locale: Locale;
  templates: ShiftTemplate[];
  /** Postcodes die deze gebruiker op een sjabloon mag zetten. */
  postOptions: string[];
}) {
  const nl = locale === 'nl';
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const open = templates.find((template) => template.id === openId) ?? null;

  function startNew() {
    setOpenId(null);
    setCreating(true);
  }

  function openTemplate(id: string) {
    setCreating(false);
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{nl ? 'De sjablonen' : 'The templates'}</h2>
        <Button type="button" onClick={startNew}>
          {nl ? 'Nieuw sjabloon' : 'New template'}
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-[#5c667f]">
            {nl
              ? 'Er staat nog geen enkel sjabloon klaar. Zet de reeks van een evenement dat telkens terugkomt hier één keer neer; daarna staat ze in twee klikken op de kalender.'
              : 'There are no templates yet. Put the series of a recurring event here once; after that it takes two clicks to schedule.'}
          </p>
          <div className="mt-4 flex justify-center">
            <Button type="button" onClick={startNew}>
              {nl ? 'Eerste sjabloon maken' : 'Create the first template'}
            </Button>
          </div>
        </Card>
      ) : (
        <TemplateTable locale={locale} templates={templates} openId={openId} onOpen={openTemplate} />
      )}

      {/* Hoogstens één bewerktaak tegelijk open, over de volle breedte. */}
      {creating && (
        <TemplateEditor
          key="new"
          locale={locale}
          template={blankTemplate()}
          postOptions={postOptions}
          onClose={() => setCreating(false)}
        />
      )}
      {open && (
        <TemplateEditor
          key={open.id}
          locale={locale}
          template={open}
          postOptions={postOptions}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function TemplateTable({
  locale,
  templates,
  openId,
  onOpen,
}: {
  locale: Locale;
  templates: ShiftTemplate[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const nl = locale === 'nl';

  return (
    <Card className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-vtk-blue-soft text-left">
          <tr>
            <th className="px-4 py-2">{nl ? 'Sjabloon' : 'Template'}</th>
            <th className="px-4 py-2">Post</th>
            <th className="px-4 py-2">{nl ? 'Locatie' : 'Location'}</th>
            <th className="px-4 py-2">{nl ? 'Startuur' : 'Start time'}</th>
            <th className="px-4 py-2">{nl ? 'Shiften' : 'Shifts'}</th>
            <th className="px-4 py-2">{nl ? 'Plaatsen' : 'Spots'}</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => {
            const enabled = template.shifts.filter((shift) => shift.enabled);
            const spots = enabled.reduce((sum, shift) => sum + shift.maxParticipants, 0);
            const isOpen = template.id === openId;
            return (
              <tr
                key={template.id}
                onClick={() => onOpen(template.id)}
                className={`cursor-pointer border-t border-vtk-blue/10 align-top transition-colors hover:bg-vtk-blue-soft/50 ${
                  isOpen ? 'bg-vtk-blue-soft/70' : ''
                }`}
              >
                <td className="px-4 py-2">
                  {/* Een echt focusbaar element: een rij die enkel op een klik
                      reageert bestaat niet voor een toetsenbord of screenreader. */}
                  <button
                    type="button"
                    className="text-left font-medium text-vtk-ink underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(template.id);
                    }}
                  >
                    {template.label}
                  </button>
                  {template.note && <p className="mt-0.5 text-xs text-[#5c667f]">{template.note}</p>}
                </td>
                <td className="px-4 py-2">{template.post ?? <span className="text-[#5c667f]">—</span>}</td>
                <td className="px-4 py-2">{template.location || <span className="text-[#5c667f]">—</span>}</td>
                <td className="px-4 py-2 tabular-nums">{templateTimeOfDay(template)}</td>
                <td className="px-4 py-2 tabular-nums">
                  {enabled.length}
                  {enabled.length !== template.shifts.length && (
                    <span className="text-[#5c667f]">
                      {' '}
                      (+{template.shifts.length - enabled.length} {nl ? 'uit' : 'off'})
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 tabular-nums">{spots}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

// -----------------------------------------------------------------------------

function TemplateEditor({
  locale,
  template,
  postOptions,
  onClose,
}: {
  locale: Locale;
  template: ShiftTemplate;
  postOptions: string[];
  onClose: () => void;
}) {
  const nl = locale === 'nl';
  const isNew = template.id === '';

  const [label, setLabel] = useState(template.label);
  const [note, setNote] = useState(template.note ?? '');
  const [eventName, setEventName] = useState(template.eventName);
  const [location, setLocation] = useState(template.location);
  const [post, setPost] = useState(template.post ?? '');
  const [time, setTime] = useState(templateTimeOfDay(template));
  const [rows, setRows] = useState<Draft[]>(() =>
    template.shifts.map((shift) => ({ ...toDraftEntry(shift), uid: nextUid() })),
  );

  const enabledRows = rows.filter((row) => row.enabled);
  const totals = useMemo(
    () => ({
      spots: enabledRows.reduce((sum, row) => sum + (Number(row.maxParticipants) || 0), 0),
      vouchers: enabledRows.reduce(
        (sum, row) => sum + (Number(row.reward) || 0) * (Number(row.maxParticipants) || 0),
        0,
      ),
    }),
    [enabledRows],
  );

  function update(uid: string, patch: Partial<ShiftTemplateDraftEntry>) {
    setRows((current) => current.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  }

  function addRow() {
    // De nieuwe rij begint waar de vorige eindigt: dat is bijna altijd wat je
    // bedoelt, en anders is het één veld aanpassen.
    const last = rows[rows.length - 1];
    setRows((current) => [
      ...current,
      {
        ...blankEntry(),
        startOffsetMinutes: last ? last.startOffsetMinutes + last.durationMinutes : 0,
        location: last?.location ?? '',
      },
    ]);
  }

  const messages = {
    ...saveErrorMessages(locale),
    ...(nl
      ? {
          LABEL_REQUIRED: 'Niet opgeslagen: geef het sjabloon een naam.',
          NO_SHIFTS: 'Niet opgeslagen: een sjabloon zonder shiften zet niets neer. Voeg er minstens één toe.',
          FORBIDDEN_POST: 'Niet opgeslagen: je kan het sjabloon niet onder die post zetten.',
          TEMPLATE_GONE: 'Niet opgeslagen: dit sjabloon bestaat niet meer; iemand verwijderde het intussen.',
        }
      : {
          LABEL_REQUIRED: 'Not saved: give the template a name.',
          NO_SHIFTS: 'Not saved: a template without shifts creates nothing. Add at least one.',
          FORBIDDEN_POST: 'Not saved: you cannot put this template under that group.',
          TEMPLATE_GONE: 'Not saved: this template no longer exists; someone deleted it in the meantime.',
        }),
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {isNew ? (nl ? 'Nieuw sjabloon' : 'New template') : template.label}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[#5c667f]">
            {nl
              ? 'De tijden staan als afstand tot de start van het evenement, niet als klokuur: zo staat hetzelfde sjabloon volgende maand op een ander uur even goed. Naast elk veld zie je op welk uur dat uitkomt bij het startuur hieronder.'
              : 'Times are stored as a distance from the start of the event, not as a clock time, so the same template works next month at another hour. Next to each field you see which time that works out to at the start time below.'}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {nl ? 'Sluiten' : 'Close'}
        </Button>
      </div>

      <SaveForm
        action={saveShiftTemplateAction}
        submitLabel={isNew ? (nl ? 'Sjabloon aanmaken' : 'Create template') : nl ? 'Opslaan' : 'Save'}
        savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
        savedMessage={
          isNew
            ? nl
              ? 'Sjabloon aangemaakt. Het staat nu in de keuzelijst van "Shiften aanmaken".'
              : 'Template created. It now appears in the list on "Create shifts".'
            : nl
              ? 'Sjabloon opgeslagen. Bestaande shiften blijven zoals ze zijn.'
              : 'Template saved. Shifts that already exist are untouched.'
        }
        errorMessages={messages}
        fallbackErrorMessage={nl ? 'Opslaan mislukt.' : 'Saving failed.'}
        // Een net aangemaakt sjabloon niet in "nieuw" laten staan: een tweede
        // klik op opslaan zou er een duplicaat van maken.
        onSuccess={isNew ? onClose : undefined}
        resetOnSuccess={false}
        className="space-y-5"
      >
        <input type="hidden" name="templateId" value={template.id} />
        <input
          type="hidden"
          name="shiftsData"
          value={JSON.stringify(toPayload(rows))}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor={`label-${template.id}`}>{nl ? 'Naam van het sjabloon' : 'Template name'}</Label>
            <Input
              id={`label-${template.id}`}
              name="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={nl ? 'Cantus' : 'Cantus'}
              required
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? 'Dit staat in de keuzelijst bij "Shiften aanmaken".' : 'This is what the list on "Create shifts" shows.'}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`note-${template.id}`}>{nl ? 'Uitleg (optioneel)' : 'Explanation (optional)'}</Label>
            <Input
              id={`note-${template.id}`}
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={nl ? 'Eén regel onder de keuzelijst.' : 'One line below the list.'}
            />
          </div>
          <div>
            <Label htmlFor={`eventName-${template.id}`}>{nl ? 'Naam van het evenement' : 'Event name'}</Label>
            <Input
              id={`eventName-${template.id}`}
              name="eventName"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? `Komt achter elke shiftnaam: "${composeName(eventName || 'Cantus', nl ? 'Tap 1' : 'Tap 1')}".`
                : `Comes after every shift name: "${composeName(eventName || 'Cantus', 'Tap 1')}".`}
            </p>
          </div>
          <div>
            <Label htmlFor={`time-${template.id}`}>{nl ? 'Standaard startuur' : 'Default start time'}</Label>
            <Input
              id={`time-${template.id}`}
              name="timeOfDay"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value || '20:00')}
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? 'Enkel een voorstel: wie een reeks neerzet, kiest zelf datum en uur.'
                : 'Only a suggestion: whoever schedules a series picks date and time.'}
            </p>
          </div>
          <div>
            <Label htmlFor={`location-${template.id}`}>{nl ? 'Locatie' : 'Location'}</Label>
            <Input
              id={`location-${template.id}`}
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={nl ? 'Waaiberg' : 'Waaiberg'}
            />
          </div>
          <div>
            <Label htmlFor={`post-${template.id}`}>Post</Label>
            <Select id={`post-${template.id}`} name="post" value={post} onChange={(e) => setPost(e.target.value)}>
              <option value="">{nl ? 'Geen' : 'None'}</option>
              {postOptions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
              {/* Een sjabloon kan een post noemen die intussen gedeactiveerd is. */}
              {post !== '' && !postOptions.includes(post) && <option value={post}>{post}</option>}
            </Select>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl ? 'Waarvoor de shiften meetellen in de ranglijst.' : 'Which group the shifts count towards in the ranking.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-vtk-blue-soft px-4 py-3 text-sm">
          <span>
            <strong className="tabular-nums">{enabledRows.length}</strong> {nl ? 'shift(en)' : 'shift(s)'}
          </span>
          <span>
            <strong className="tabular-nums">{totals.spots}</strong> {nl ? 'plaatsen' : 'spots'}
          </span>
          <span>
            <strong className="tabular-nums">{totals.vouchers}</strong>{' '}
            {nl ? 'bonnetjes bij volle bezetting' : 'vouchers at full occupancy'}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{nl ? 'De shiften' : 'The shifts'}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={addRow}>
              {nl ? 'Shift toevoegen' : 'Add shift'}
            </Button>
          </div>

          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed border-vtk-blue/20 px-4 py-6 text-center text-sm text-[#5c667f]">
              {nl
                ? 'Nog geen shiften. Voeg de eerste toe; de volgende begint vanzelf waar deze eindigt.'
                : 'No shifts yet. Add the first one; the next starts where this one ends.'}
            </p>
          )}

          {rows.map((row, index) => (
            <EntryRow
              key={row.uid}
              locale={locale}
              index={index}
              row={row}
              timeOfDay={time}
              templateLocation={location}
              templatePost={post}
              postOptions={postOptions}
              onChange={(patch) => update(row.uid, patch)}
              onRemove={() => setRows((current) => current.filter((item) => item.uid !== row.uid))}
            />
          ))}
        </div>
      </SaveForm>

      {/* Verwijderen staat in het detail en niet in de rij: het is de enige
          onomkeerbare actie hier. */}
      {!isNew && !template.builtIn && (
        <div className="mt-4 border-t border-vtk-blue/10 pt-4">
          <DeleteButton
            action={deleteShiftTemplateAction}
            fields={{ templateId: template.id }}
            title={nl ? 'Sjabloon verwijderen?' : 'Delete template?'}
            description={
              nl
                ? `"${template.label}" en zijn ${template.shifts.length} shiftregel(s) verdwijnen uit de keuzelijst. Shiften die met dit sjabloon al aangemaakt zijn, blijven gewoon staan met hun inschrijvingen; enkel het sjabloon zelf gaat weg.`
                : `"${template.label}" and its ${template.shifts.length} shift row(s) disappear from the list. Shifts already created from it stay, including their sign-ups; only the template itself goes.`
            }
            confirmLabel={nl ? 'Verwijderen' : 'Delete'}
            cancelLabel={nl ? 'Annuleren' : 'Cancel'}
            successMessage={nl ? 'Sjabloon verwijderd.' : 'Template deleted.'}
          >
            {nl ? 'Sjabloon verwijderen' : 'Delete template'}
          </DeleteButton>
        </div>
      )}
      {!isNew && template.builtIn && (
        <p className="mt-4 border-t border-vtk-blue/10 pt-4 text-xs text-[#5c667f]">
          {nl
            ? 'Dit sjabloon wordt meegeleverd en kan niet verwijderd worden: de site gebruikt het zelf, onder meer om elke Theokot-verkoopdag te bemannen. Aanpassen mag wel.'
            : 'This template ships with the site and cannot be deleted: the site uses it itself, among other things to staff every Theokot sales day. Editing is fine.'}
        </p>
      )}
    </Card>
  );
}

// -----------------------------------------------------------------------------

function EntryRow({
  locale,
  index,
  row,
  timeOfDay,
  templateLocation,
  templatePost,
  postOptions,
  onChange,
  onRemove,
}: {
  locale: Locale;
  index: number;
  row: Draft;
  timeOfDay: string;
  templateLocation: string;
  templatePost: string;
  postOptions: string[];
  onChange: (patch: Partial<ShiftTemplateDraftEntry>) => void;
  onRemove: () => void;
}) {
  const nl = locale === 'nl';
  const start = templateClockAt(timeOfDay, row.startOffsetMinutes, nl);
  const end = templateClockAt(timeOfDay, row.startOffsetMinutes + row.durationMinutes, nl);
  const id = `${row.uid}`;

  return (
    <div className={`rounded-2xl border border-vtk-blue/10 p-4 ${row.enabled ? '' : 'opacity-60'}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="font-medium">
          {index + 1}. {row.name.trim() === '' ? (nl ? 'Naamloze shift' : 'Unnamed shift') : row.name}
        </span>
        <span className="text-xs tabular-nums text-[#5c667f]">
          {start} &rarr; {end} &middot; {formatTemplateDuration(Math.max(row.durationMinutes, 0), nl)}
        </span>
        <span className="ml-auto">
          <IconButton
            label={nl ? 'Shift verwijderen' : 'Remove shift'}
            srLabel={`${nl ? 'Shift verwijderen' : 'Remove shift'}: ${row.name || index + 1}`}
            tone="danger"
            onClick={onRemove}
          >
            <TrashIcon />
          </IconButton>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-name`}>{nl ? 'Naam' : 'Name'}</Label>
          <Input
            id={`${id}-name`}
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={nl ? 'Tappen en rondbrengen' : 'Tap and serve'}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-start`}>{nl ? 'Begin (minuten)' : 'Start (minutes)'}</Label>
          <Input
            id={`${id}-start`}
            type="number"
            step={5}
            value={row.startOffsetMinutes}
            onChange={(e) => onChange({ startOffsetMinutes: Math.round(Number(e.target.value) || 0) })}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {formatTemplateOffset(row.startOffsetMinutes, nl)} &middot; {start}
          </p>
        </div>
        <div>
          <Label htmlFor={`${id}-duration`}>{nl ? 'Duur (minuten)' : 'Duration (minutes)'}</Label>
          <Input
            id={`${id}-duration`}
            type="number"
            min={5}
            step={5}
            value={row.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: Math.round(Number(e.target.value) || 0) })}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl ? 'tot' : 'until'} {end}
          </p>
        </div>
        <div>
          <Label htmlFor={`${id}-spots`}>{nl ? 'Plaatsen' : 'Spots'}</Label>
          <Input
            id={`${id}-spots`}
            type="number"
            min={1}
            value={row.maxParticipants}
            onChange={(e) => onChange({ maxParticipants: Math.round(Number(e.target.value) || 0) })}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-reward`}>{nl ? 'Bonnetjes' : 'Vouchers'}</Label>
          <Input
            id={`${id}-reward`}
            type="number"
            min={0}
            value={row.reward}
            onChange={(e) => onChange({ reward: Math.round(Number(e.target.value) || 0) })}
          />
          <p className="mt-1 text-xs text-[#5c667f]">{nl ? 'per deelnemer' : 'per participant'}</p>
        </div>
        <div>
          <Label htmlFor={`${id}-location`}>{nl ? 'Eigen locatie' : 'Own location'}</Label>
          <Input
            id={`${id}-location`}
            value={row.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder={templateLocation || (nl ? 'Zelfde als het sjabloon' : 'Same as the template')}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? 'Leeg = de locatie van het sjabloon. Vul enkel in wat er echt van afwijkt, bv. bijrijden aan de loods.'
              : 'Empty = the template location. Only fill in what really differs, e.g. loading at the shed.'}
          </p>
        </div>
        <div>
          <Label htmlFor={`${id}-post`}>Post</Label>
          <Select id={`${id}-post`} value={row.post} onChange={(e) => onChange({ post: e.target.value })}>
            <option value={INHERIT_POST}>
              {nl ? `Van het sjabloon (${templatePost || 'geen'})` : `From the template (${templatePost || 'none'})`}
            </option>
            <option value={NO_POST}>{nl ? 'Geen post' : 'No group'}</option>
            {postOptions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
            {row.post !== INHERIT_POST && row.post !== NO_POST && !postOptions.includes(row.post) && (
              <option value={row.post}>{row.post}</option>
            )}
          </Select>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor={`${id}-description`}>{nl ? 'Beschrijving' : 'Description'}</Label>
          <Input
            id={`${id}-description`}
            value={row.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={nl ? 'Bier tappen en de kannen rondbrengen' : 'Tap beer and carry the jugs around'}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl ? 'Dit leest een lid op /shift voor hij inschrijft.' : 'This is what a member reads on /shift before signing up.'}
          </p>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <Label htmlFor={`${id}-instructions`}>{nl ? 'Uitleg (optioneel)' : 'Explanation (optional)'}</Label>
          <Textarea
            id={`${id}-instructions`}
            rows={3}
            value={row.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.openToInternationals}
              onChange={(e) => onChange({ openToInternationals: e.target.checked })}
            />
            <span>{nl ? 'Ook voor internationals' : 'Open to internationals'}</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={row.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
            />
            <span>
              {nl ? 'Standaard aangevinkt' : 'Ticked by default'}
              <span className="ml-1 text-xs text-[#5c667f]">
                {nl ? '(uit = enkel bij een grote editie)' : '(off = only for a big edition)'}
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
