"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, Input, Label, Select, Textarea } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { IconButton } from "@/components/ui/IconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
import { saveSlogansAction } from "@/app/actions/slogans";
import {
  SLOGAN_INTERVAL_MAX,
  nextSloganIndex,
  parseSlogan,
  resolveSlogans,
  sloganWindowAt,
  type Slogan,
  type SloganAudience,
  type SloganLine,
  type SlogansConfig,
  type SloganWindow,
} from "@/lib/slogans";

/**
 * De klok van de browser, elke minuut ververst.
 *
 * Via een externe store en niet via `new Date()` tijdens het renderen: de server
 * rendert dit scherm mee, en een dagdeel dat tussen server en browser kantelt,
 * geeft anders een hydratiefout. Vóór de hydratie is het dus `null` en toont het
 * voorbeeld nog geen dagdeel.
 */
let clockStamp: number | null = null;

function subscribeClock(onChange: () => void) {
  clockStamp = Date.now();
  onChange();
  const timer = setInterval(() => {
    clockStamp = Date.now();
    onChange();
  }, 60_000);
  return () => clearInterval(timer);
}

const getClock = () => clockStamp;
const getServerClock = () => null;

const AUDIENCE_LABELS: Record<SloganAudience, { nl: string; en: string }> = {
  all: { nl: "Iedereen", en: "Everyone" },
  members: { nl: "Enkel aangemelde leden", en: "Signed-in members only" },
  guests: { nl: "Enkel niet-aangemelde bezoekers", en: "Signed-out visitors only" },
};

const WINDOW_LABELS: Record<SloganWindow, { nl: string; en: string }> = {
  any: { nl: "Altijd", en: "Always" },
  morning: { nl: "Ochtend (6u-12u)", en: "Morning (6am-12pm)" },
  afternoon: { nl: "Middag (12u-18u)", en: "Afternoon (12pm-6pm)" },
  evening: { nl: "Avond (18u-24u)", en: "Evening (6pm-12am)" },
  night: { nl: "Nacht (0u-6u)", en: "Night (12am-6am)" },
};

/** De slogan zoals de hero ze zet: geel schuin accent, echte regelafbrekingen. */
function SloganLines({ lines }: { lines: SloganLine[] }) {
  return (
    <>
      {lines.map((line, lineIdx) => (
        <span className="vtk-slogan-line" key={lineIdx}>
          {line.map((segment, idx) =>
            segment.accent ? (
              <span className="vtk-slogan-accent" key={idx}>
                {segment.text}
              </span>
            ) : (
              <span key={idx}>{segment.text}</span>
            ),
          )}
        </span>
      ))}
    </>
  );
}

export function SlogansEditor({
  locale,
  initialConfig,
}: {
  locale: Locale;
  initialConfig: SlogansConfig;
}) {
  const dict = getDictionary(locale);
  const isNl = locale === "nl";
  const baseId = useId();
  const t = (nl: string, en: string) => (isNl ? nl : en);

  const [items, setItems] = useState<Slogan[]>(() => initialConfig.items);
  const [intervalSeconds, setIntervalSeconds] = useState(initialConfig.intervalSeconds);

  // Voorbeeldinstellingen: welke bezoeker, welke taal, welke naam.
  const [previewLocale, setPreviewLocale] = useState<Locale>(locale);
  const [asMember, setAsMember] = useState(true);
  const [previewName, setPreviewName] = useState("Jan Peeters");
  const [focused, setFocused] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Slogan | null>(null);

  const stamp = useSyncExternalStore(subscribeClock, getClock, getServerClock);
  const now = useMemo(() => (stamp === null ? null : new Date(stamp)), [stamp]);

  const previewUser = asMember
    ? {
        name: previewName.trim() || "Jan Peeters",
        firstName: (previewName.trim() || "Jan Peeters").split(" ")[0] || null,
      }
    : null;

  const resolved = useMemo(
    () =>
      resolveSlogans({
        config: { items, intervalSeconds },
        locale: previewLocale,
        user: previewUser,
        now: now ?? new Date(0),
      }),
    // previewUser is elke render een nieuw object; de naam erin is wat telt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, intervalSeconds, previewLocale, asMember, previewName, now],
  );

  // Geen effect dat de teller terugzet wanneer de lijst korter wordt: clampen
  // volstaat, en een effect dat enkel `setState` doet, is een extra render.
  const [previewIndex, setPreviewIndex] = useState(0);
  useEffect(() => {
    if (focused || intervalSeconds <= 0 || resolved.items.length <= 1) return;
    const timer = setTimeout(
      () =>
        setPreviewIndex((prev) =>
          nextSloganIndex(prev, resolved.items.length, resolved.openerCount),
        ),
      Math.max(3000, intervalSeconds * 1000),
    );
    return () => clearTimeout(timer);
  }, [focused, previewIndex, intervalSeconds, resolved.items.length, resolved.openerCount]);

  // Wie een rij aan het bewerken is, ziet díé slogan; anders draait het voorbeeld.
  const focusedIndex = focused ? resolved.items.findIndex((item) => item.id === focused) : -1;
  const shown =
    focusedIndex >= 0
      ? resolved.items[focusedIndex]
      : resolved.items[Math.min(previewIndex, Math.max(0, resolved.items.length - 1))];
  const focusedHidden = Boolean(focused) && focusedIndex < 0;

  const addItem = () => {
    const item: Slogan = {
      id: `slogan-${Date.now()}`,
      nl: "",
      en: "",
      audience: "all",
      opener: false,
      window: "any",
    };
    setItems((prev) => [...prev, item]);
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((item) => item.id !== id));

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      const moved = copy[index]!;
      copy[index] = copy[target]!;
      copy[target] = moved;
      return copy;
    });
  };

  const updateItem = (index: number, patch: Partial<Slogan>) =>
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });

  // De hero zet de hele reeks even groot, op maat van de langste slogan; dat is
  // het enige wat een redacteur van de lengte moet weten.
  const size = resolved.size;
  const sizeHint =
    size === "l"
      ? t(
          "De titel staat op volle grootte. Blijft elke slogan kort, dan blijft dat zo.",
          "The headline is at full size. As long as every slogan stays short, it stays that way.",
        )
      : size === "m"
        ? t(
            "De langste slogan is aan de lange kant, dus de hele reeks staat een maat kleiner in de hero.",
            "The longest slogan is on the long side, so the whole sequence sits one size smaller in the hero.",
          )
        : t(
            "De langste slogan is lang, dus de hele reeks staat twee maten kleiner in de hero. Kort ze in om de titel groot te houden.",
            "The longest slogan is long, so the whole sequence sits two sizes smaller in the hero. Shorten it to keep the headline large.",
          );

  const serialized = JSON.stringify({ items, intervalSeconds });
  const empty = items.filter((item) => !item.nl.trim() && !item.en?.trim()).length;
  const windowNow = now ? WINDOW_LABELS[sloganWindowAt(now)][isNl ? "nl" : "en"] : null;

  return (
    <SaveForm
      action={saveSlogansAction}
      className="space-y-6"
      submitLabel={dict.admin.save}
      savingLabel={dict.common.saving}
      savedMessage={t("Slogans opgeslagen", "Slogans saved")}
      errorMessages={{
        ...saveErrorMessages(locale),
        NO_SLOGANS: t(
          "Niet opgeslagen: er moet minstens één slogan overblijven, anders heeft de hero geen titel.",
          "Not saved: at least one slogan must remain, otherwise the hero has no headline.",
        ),
        EMPTY_SLOGAN: t(
          "Niet opgeslagen: er staat een slogan zonder tekst in de lijst.",
          "Not saved: one of the slogans has no text.",
        ),
      }}
      fallbackErrorMessage={dict.common.saveError}
      submitDisabled={items.length === 0 || empty > 0}
      resetOnSuccess={false}
    >
      <input type="hidden" name="slogansData" value={serialized} />

      {/* Voorbeeld */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("Voorbeeld", "Preview")}</h2>
            <p className="text-sm text-[#5c667f]">
              {t(
                "Zoals de hero het toont: de begroeting opent, daarna roteren de slogans.",
                "The way the hero shows it: the greeting opens, then the slogans rotate.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-vtk-blue/15 text-xs">
              {(["nl", "en"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPreviewLocale(code)}
                  aria-pressed={previewLocale === code}
                  className={`px-3 py-1 font-medium ${
                    previewLocale === code ? "bg-vtk-ink text-white" : "text-[#5c667f]"
                  }`}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-full border border-vtk-blue/15 text-xs">
              <button
                type="button"
                onClick={() => setAsMember(false)}
                aria-pressed={!asMember}
                className={`px-3 py-1 font-medium ${
                  !asMember ? "bg-vtk-ink text-white" : "text-[#5c667f]"
                }`}
              >
                {t("Als bezoeker", "As visitor")}
              </button>
              <button
                type="button"
                onClick={() => setAsMember(true)}
                aria-pressed={asMember}
                className={`px-3 py-1 font-medium ${
                  asMember ? "bg-vtk-ink text-white" : "text-[#5c667f]"
                }`}
              >
                {t("Als lid", "As member")}
              </button>
            </div>
          </div>
        </div>

        <div className="vtk-slogan-preview" data-size={resolved.size}>
          {shown ? <SloganLines lines={shown.lines} /> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#5c667f]">
          <span>
            {focusedHidden
              ? t(
                  "Deze slogan staat nu niet op de site: ze past niet bij dit publiek of dit dagdeel.",
                  "This slogan is not on the site right now: it does not match this audience or time of day.",
                )
              : focusedIndex >= 0
                ? t("Je bewerkt deze slogan.", "You are editing this slogan.")
                : t(
                    `${resolved.items.length} slogan(s) in de reeks${windowNow ? `, dagdeel nu: ${windowNow.toLowerCase()}` : ""}`,
                    `${resolved.items.length} slogan(s) in the sequence${windowNow ? `, current time of day: ${windowNow.toLowerCase()}` : ""}`,
                  )}
          </span>
          {asMember ? (
            <label className="flex items-center gap-2">
              <span>{t("Naam van het lid", "Member name")}</span>
              <Input
                value={previewName}
                onChange={(event) => setPreviewName(event.target.value)}
                className="h-8 w-40 py-1 text-xs"
              />
            </label>
          ) : null}
        </div>
      </Card>

      {/* De lijst */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col gap-2 border-b border-vtk-blue/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("Slogans", "Slogans")}</h2>
            <p className="text-sm text-[#5c667f]">
              {t(
                "Zet het gele accent tussen sterretjes: Ingenieurs zijn *superieur*. Een enter in het veld is een echte regelafbreking in de hero.",
                "Put the yellow accent between asterisks: Engineers are *superior*. A newline in the field is a real line break in the hero.",
              )}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={addItem} className="shrink-0 text-sm">
            <Plus size={14} aria-hidden="true" className="mr-1 inline" />
            {t("Slogan toevoegen", "Add slogan")}
          </Button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => {
            const preview = parseSlogan(item.nl || item.en || "");
            return (
              <div
                key={item.id}
                className="rounded-xl border border-vtk-blue/15 bg-white p-4"
                onFocus={() => setFocused(item.id)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setFocused((prev) => (prev === item.id ? null : prev));
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-vtk-blue-soft text-xs font-semibold text-vtk-blue">
                      {idx + 1}
                    </span>
                    {item.opener ? (
                      <span className="rounded-md bg-vtk-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {t("Begroeting", "Greeting")}
                      </span>
                    ) : null}
                    {item.audience !== "all" ? (
                      <span className="rounded-md bg-vtk-blue-soft px-1.5 py-0.5 text-[10px] font-semibold text-vtk-blue">
                        {AUDIENCE_LABELS[item.audience][isNl ? "nl" : "en"]}
                      </span>
                    ) : null}
                    {item.window !== "any" ? (
                      <span className="rounded-md bg-vtk-blue-soft px-1.5 py-0.5 text-[10px] font-semibold text-vtk-blue">
                        {WINDOW_LABELS[item.window][isNl ? "nl" : "en"]}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      label={t("Omhoog", "Move up")}
                      srLabel={`${t("Omhoog", "Move up")}: ${item.nl || item.en || idx + 1}`}
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                    >
                      <ChevronUp size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t("Omlaag", "Move down")}
                      srLabel={`${t("Omlaag", "Move down")}: ${item.nl || item.en || idx + 1}`}
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === items.length - 1}
                    >
                      <ChevronDown size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={t("Verwijderen", "Delete")}
                      srLabel={`${t("Verwijderen", "Delete")}: ${item.nl || item.en || idx + 1}`}
                      tone="danger"
                      onClick={() => setConfirmDelete(item)}
                      disabled={items.length <= 1}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-nl-${item.id}`}>{t("Nederlands", "Dutch")}</Label>
                    <Textarea
                      id={`${baseId}-nl-${item.id}`}
                      rows={2}
                      value={item.nl}
                      onChange={(event) => updateItem(idx, { nl: event.target.value })}
                      placeholder={t("Ingenieurs zijn *superieur*.", "Ingenieurs zijn *superieur*.")}
                      className="min-h-0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-en-${item.id}`} className="text-[#5c667f]">
                      {t("Engels (leeg = Nederlands)", "English (empty = Dutch)")}
                    </Label>
                    <Textarea
                      id={`${baseId}-en-${item.id}`}
                      rows={2}
                      value={item.en ?? ""}
                      onChange={(event) => updateItem(idx, { en: event.target.value })}
                      placeholder={item.nl}
                      className="min-h-0"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 border-t border-vtk-blue/10 pt-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-aud-${item.id}`}>{t("Publiek", "Audience")}</Label>
                    <Select
                      id={`${baseId}-aud-${item.id}`}
                      value={item.audience}
                      onChange={(event) =>
                        updateItem(idx, { audience: event.target.value as SloganAudience })
                      }
                    >
                      {(Object.keys(AUDIENCE_LABELS) as SloganAudience[]).map((value) => (
                        <option key={value} value={value}>
                          {AUDIENCE_LABELS[value][isNl ? "nl" : "en"]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-win-${item.id}`}>
                      {t("Wanneer op de dag", "Time of day")}
                    </Label>
                    <Select
                      id={`${baseId}-win-${item.id}`}
                      value={item.window}
                      onChange={(event) =>
                        updateItem(idx, { window: event.target.value as SloganWindow })
                      }
                    >
                      {(Object.keys(WINDOW_LABELS) as SloganWindow[]).map((value) => (
                        <option key={value} value={value}>
                          {WINDOW_LABELS[value][isNl ? "nl" : "en"]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <label className="flex items-start gap-2 pt-6 text-sm">
                    <input
                      type="checkbox"
                      checked={item.opener}
                      onChange={(event) => updateItem(idx, { opener: event.target.checked })}
                      className="mt-0.5 size-4 rounded border-zinc-300 text-vtk-blue focus:ring-vtk-blue"
                    />
                    <span>
                      {t("Opent de reeks", "Opens the sequence")}
                      <span className="block text-xs text-[#5c667f]">
                        {t("en komt daarna niet terug", "and does not come back")}
                      </span>
                    </span>
                  </label>
                </div>

                {item.opener || item.audience === "members" ? (
                  <p className="mt-2 text-xs text-[#5c667f]">
                    {t(
                      "Gebruik {firstName} voor de voornaam of {name} voor de volledige naam.",
                      "Use {firstName} for the first name or {name} for the full name.",
                    )}
                  </p>
                ) : null}

                {preview.length === 0 ? (
                  <p className="mt-2 text-xs text-red-600">
                    {t("Deze slogan heeft nog geen tekst.", "This slogan has no text yet.")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Rotatie */}
      <Card className="space-y-3 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("Rotatie", "Rotation")}</h2>
          <p className="text-sm text-[#5c667f]">
            {t(
              "Hoe lang elke slogan blijft staan. De reeks begint altijd bij het begin, dus wat je bovenaan zet, ziet iedereen het eerst.",
              "How long each slogan stays. The sequence always starts at the top, so whatever you put first is what everyone sees first.",
            )}
          </p>
        </div>
        <p className="text-sm text-[#5c667f]">
          {sizeHint}
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t border-vtk-blue/10 pt-3">
          <Label htmlFor={`${baseId}-interval`} className="sr-only">
            {t("Wisseltijd in seconden", "Rotation interval in seconds")}
          </Label>
          <Input
            id={`${baseId}-interval`}
            type="number"
            min={0}
            max={SLOGAN_INTERVAL_MAX}
            value={intervalSeconds}
            onChange={(event) => setIntervalSeconds(Number(event.target.value) || 0)}
            className="w-24"
          />
          <span className="text-xs text-[#5c667f]">
            {intervalSeconds === 0
              ? t(
                  "0 = niet roteren; enkel de eerste slogan blijft staan.",
                  "0 = no rotation; only the first slogan stays.",
                )
              : t(
                  `Wisselt elke ${intervalSeconds} seconden (minimum 3).`,
                  `Rotates every ${intervalSeconds} seconds (minimum 3).`,
                )}
          </span>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("Slogan verwijderen?", "Delete slogan?")}
        description={
          <>
            <span className="block font-medium text-vtk-ink">
              {confirmDelete?.nl || confirmDelete?.en}
            </span>
            <span className="mt-1 block">
              {t(
                "Ze verdwijnt uit de rotatie zodra je opslaat. De andere slogans blijven staan.",
                "It leaves the rotation as soon as you save. The other slogans stay.",
              )}
            </span>
          </>
        }
        confirmLabel={t("Verwijderen", "Delete")}
        cancelLabel={t("Annuleren", "Cancel")}
        onConfirm={() => {
          if (confirmDelete) removeItem(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </SaveForm>
  );
}
