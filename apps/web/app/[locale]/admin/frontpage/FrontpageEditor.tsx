"use client";

import { Card, Input, Label, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { StorageImageField } from "@/components/admin/StorageImageField";
import { saveFrontpageAction, setFrontpageActiveAction } from "@/app/actions/frontpage";
import type { FieldDef } from "@/lib/frontpage/fields";
import { saveErrorMessages } from "@/lib/saveMessages";

export type FrontpageCard = {
  layout: string;
  /** URL of the standalone render used in the preview frame. */
  previewUrl: string;
  label: string;
  description: string;
  /** Field declarations from the registry, in the order they were written. */
  fields: Array<[string, FieldDef]>;
  /** Current values; datetimes already converted to "YYYY-MM-DDTHH:mm". */
  values: Record<string, string>;
  isDefault: boolean;
  startsAt: string;
  endsAt: string;
  active: boolean;
  status: "live" | "scheduled" | "expired" | "off";
  /** True for the one that a visitor sees right now. */
  showing: boolean;
  windowLabel: string;
};

const STATUS_CLASS = {
  live: "bg-emerald-50 text-emerald-800",
  scheduled: "bg-amber-50 text-amber-800",
  expired: "bg-vtk-blue-soft text-[#5c667f]",
  off: "bg-vtk-blue-soft text-[#5c667f]",
} as const;

/**
 * Field inputs are posted under `field.<name>`, keeping them clear of the form's
 * own controls (`layout`, `startsAt`, `endsAt`, `active`).
 *
 * Without that prefix a front page declaring a field called `startsAt` — which
 * the 24-urenloop does, for the start gun — puts a second input of that name in
 * the same form, and `formData.get("startsAt")` silently returns whichever comes
 * first. The scheduling window then swallowed the event's own start time.
 */
export const FIELD_PREFIX = "field.";

/**
 * A live preview of the front page, in an iframe.
 *
 * Deliberately the real page rather than a picture of it: a screenshot goes
 * stale the moment anyone changes a field, and this is exactly the screen where
 * fields change. It is rendered at desktop width and scaled down, because a
 * narrow iframe would show the mobile layout, which is not what you are
 * checking here.
 */
function Preview({ url, title }: { url: string; title: string }) {
  // Rendered at a fixed desktop width and scaled to whatever the card gives it,
  // so the frame always shows the desktop layout however wide the admin is. The
  // scale comes from container query units: `100cqw / WIDTH` is a length over a
  // length, which is the unitless number `scale()` wants. The wrapper's
  // aspect-ratio then works out to exactly the scaled height, with no gap.
  const WIDTH = 1280;
  const HEIGHT = 560;
  return (
    <div
      className="overflow-hidden rounded-xl border border-vtk-blue/15 bg-vtk-ink"
      style={{ containerType: "inline-size", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <iframe
        src={url}
        title={title}
        loading="lazy"
        // Deliberately no `sandbox`. A sandboxed frame gets an opaque origin,
        // and Next's dev server then refuses to serve it `_next/static`, so the
        // preview arrives as unstyled HTML on a black rectangle. The framed page
        // is our own, behind the same permission as this screen, and
        // `pointer-events: none` below means nobody interacts with it anyway;
        // `sandbox="allow-same-origin allow-scripts"` would have been the only
        // working alternative and that combination lets a frame lift its own
        // sandbox, so it buys nothing.
        scrolling="no"
        style={{
          width: WIDTH,
          height: HEIGHT,
          border: 0,
          transform: `scale(calc(100cqw / ${WIDTH}px))`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** One input, rendered from what the front page declared it wants. */
function Field({
  name,
  def,
  value,
  locale,
}: {
  name: string;
  def: FieldDef;
  value: string;
  locale: Locale;
}) {
  const nl = locale === "nl";
  const label = nl ? def.labelNl : def.labelEn;
  const help = nl ? def.helpNl : def.helpEn;
  const id = `fp-${name}`;
  const inputName = `${FIELD_PREFIX}${name}`;

  if (def.type === "image") {
    return (
      <div className="sm:col-span-2">
        <StorageImageField
          name={inputName}
          defaultKey={value || null}
          locale={locale}
          label={label}
          srContext={label}
          helpText={help}
          // What the site really shows without an upload, so the preview here
          // matches the front page instead of claiming there is no photo.
          fallbackUrl={def.fallbackUrl}
          emptyHint={nl ? "Meegeleverde foto" : "Bundled photo"}
        />
      </div>
    );
  }

  return (
    <div className={def.type === "textarea" ? "sm:col-span-2" : undefined}>
      <Label htmlFor={id}>{label}</Label>
      {def.type === "textarea" ? (
        <Textarea
          id={id}
          name={inputName}
          defaultValue={value}
          rows={3}
          placeholder={def.placeholder}
        />
      ) : (
        <Input
          id={id}
          name={inputName}
          type={def.type === "datetime" ? "datetime-local" : "text"}
          defaultValue={value}
          placeholder={def.placeholder}
        />
      )}
      {help ? <p className="mt-1 text-xs text-[#5c667f]">{help}</p> : null}
    </div>
  );
}

/**
 * One card per front page, each with the fields that front page declared.
 *
 * Deliberately not one shared form with a layout picker: these are different
 * pages, not one page in different modes, and seeing them side by side is what
 * makes "which one is live" answerable at a glance.
 */
export function FrontpageEditor({
  locale,
  cards,
}: {
  locale: Locale;
  cards: FrontpageCard[];
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  const statusLabels = nl
    ? { live: "Actief", scheduled: "Gepland", expired: "Afgelopen", off: "Uit" }
    : { live: "Active", scheduled: "Scheduled", expired: "Ended", off: "Off" };

  // De gedeelde meldingen (o.a. INVALID_URL voor een knopadres) plus wat enkel
  // hier speelt.
  const errorMessages = {
    ...saveErrorMessages(locale),
    ...(nl
      ? {
          UNKNOWN_LAYOUT: "Deze frontpage bestaat niet meer in de code.",
          WINDOW_INVALID: "De einddatum ligt voor de startdatum.",
        }
      : {
          UNKNOWN_LAYOUT: "This front page no longer exists in the code.",
          WINDOW_INVALID: "The end date is before the start date.",
        }),
  };

  return (
    <div className="space-y-6">
      {cards.map((card) => (
        <Card className="p-5" key={card.layout}>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="font-semibold">{card.label}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[card.status]}`}
            >
              {statusLabels[card.status]}
            </span>
            {card.showing ? (
              <span className="rounded-full bg-vtk-ink px-2 py-0.5 text-xs font-medium text-white">
                {nl ? "Staat nu op de site" : "On the site right now"}
              </span>
            ) : null}
            {!card.isDefault ? (
              <form action={setFrontpageActiveAction} className="ml-auto">
                <input type="hidden" name="layout" value={card.layout} />
                <input type="hidden" name="active" value={card.active ? "0" : "1"} />
                <button
                  type="submit"
                  className="rounded-full border border-vtk-blue/15 px-3 py-1 text-xs font-medium text-vtk-ink hover:bg-vtk-blue-soft/60"
                >
                  {card.active ? (nl ? "Uitzetten" : "Turn off") : nl ? "Aanzetten" : "Turn on"}
                </button>
              </form>
            ) : null}
          </div>
          <p className="mb-4 text-sm text-[#5c667f]">
            {card.description}
            {!card.isDefault && card.windowLabel ? ` · ${card.windowLabel}` : ""}
          </p>

          <div className="mb-5">
            <Preview url={card.previewUrl} title={card.label} />
            <p className="mt-2 text-xs text-[#5c667f]">
              {nl
                ? "Voorbeeld met de opgeslagen waarden. Sla op om je wijzigingen hier te zien."
                : "Preview with the saved values. Save to see your changes here."}
            </p>
          </div>

          <SaveForm
            action={saveFrontpageAction}
            className="space-y-4"
            submitLabel={dict.admin.save}
            savingLabel={dict.common.saving}
            savedMessage={nl ? "Frontpage opgeslagen" : "Front page saved"}
            errorMessages={errorMessages}
            fallbackErrorMessage={dict.common.saveError}
          >
            <input type="hidden" name="layout" value={card.layout} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {card.fields.map(([name, def]) => (
                <Field
                  key={name}
                  name={name}
                  def={def}
                  value={card.values[name] ?? ""}
                  locale={locale}
                />
              ))}
            </div>

            {card.isDefault ? (
              <p className="text-xs text-[#5c667f]">
                {nl
                  ? "De standaard staat er zodra geen enkele andere frontpage actief is. Ze heeft dus geen venster en kan niet uitgezet worden."
                  : "The default is shown whenever no other front page is active. It therefore has no window and cannot be switched off."}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`start-${card.layout}`}>
                      {nl ? "Zichtbaar vanaf" : "Visible from"}
                    </Label>
                    <Input
                      id={`start-${card.layout}`}
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={card.startsAt}
                    />
                    <p className="mt-1 text-xs text-[#5c667f]">
                      {nl ? "Leeg = meteen." : "Empty = right away."}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={`end-${card.layout}`}>
                      {nl ? "Zichtbaar tot" : "Visible until"}
                    </Label>
                    <Input
                      id={`end-${card.layout}`}
                      name="endsAt"
                      type="datetime-local"
                      defaultValue={card.endsAt}
                    />
                    <p className="mt-1 text-xs text-[#5c667f]">
                      {nl ? "Leeg = blijft staan." : "Empty = stays up."}
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={card.active} />
                  {nl ? "Actief" : "Active"}
                </label>
                <p className="text-xs text-[#5c667f]">
                  {nl
                    ? "Enkel een actieve frontpage binnen haar venster neemt de homepage over. Staan er meerdere tegelijk klaar, dan wint de laatst gestarte."
                    : "Only an active front page inside its window takes over the homepage. If several are ready at once, the most recently started one wins."}
                </p>
              </>
            )}
          </SaveForm>
        </Card>
      ))}
    </div>
  );
}
