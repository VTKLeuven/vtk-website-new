"use client";

import { useId, useState } from "react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveSlogansAction } from "@/app/actions/slogans";
import {
  interpolateName,
  type PersonalSlogan,
  type SloganItem,
  type SlogansConfig,
} from "@/lib/slogans";

function SloganPreviewChip({
  title,
  accent,
  tail,
}: {
  title?: string;
  accent?: string;
  tail?: string;
}) {
  return (
    <div className="rounded-lg bg-[#0a0f1f] p-4 text-white shadow-inner font-sans">
      <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
        Voorbeeldweergave
      </div>
      <div className="text-lg font-semibold leading-tight">
        {tail ? (
          <>
            {title ? `${title} ` : null}
            {accent ? (
              <span className="serif italic text-[#FCD34D] font-normal">{accent}</span>
            ) : null}
            <br />
            {tail}
          </>
        ) : (
          <>
            {title ? (
              <>
                {title}
                {accent ? <br /> : null}
              </>
            ) : null}
            {accent ? (
              <span className="serif italic text-[#FCD34D] font-normal">{accent}</span>
            ) : null}
          </>
        )}
      </div>
    </div>
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

  const [items, setItems] = useState<SloganItem[]>(() => initialConfig.items);
  const [personal, setPersonal] = useState<PersonalSlogan>(
    () =>
      initialConfig.personal ?? {
        enabled: true,
        titleNl: "Welkom terug,",
        accentNl: "{firstName}!",
        tailNl: "",
        titleEn: "Welcome back,",
        accentEn: "{firstName}!",
        tailEn: "",
      },
  );
  const [intervalSeconds, setIntervalSeconds] = useState(
    initialConfig.intervalSeconds,
  );
  const [randomizeOnReload, setRandomizeOnReload] = useState(
    initialConfig.randomizeOnReload,
  );

  const [previewMemberName, setPreviewMemberName] = useState("Jan Peeters");

  const addItem = () => {
    const newItem: SloganItem = {
      id: `slogan-${Date.now()}`,
      titleNl: "",
      accentNl: "",
      tailNl: "",
      titleEn: "",
      accentEn: "",
      tailEn: "",
    };
    setItems((prev) => [...prev, newItem]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[target]!;
      copy[target] = temp;
      return copy;
    });
  };

  const updateItem = (index: number, patch: Partial<SloganItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });
  };

  const serializedData = JSON.stringify({
    items,
    personal,
    intervalSeconds,
    randomizeOnReload,
  });

  const previewFirstName = previewMemberName.trim().split(" ")[0] || "Jan";

  return (
    <SaveForm
      action={saveSlogansAction}
      className="space-y-6"
      submitLabel={dict.admin.save}
      savingLabel={dict.common.saving}
      savedMessage={
        isNl ? "Slogans succesvol opgeslagen" : "Slogans saved successfully"
      }
      fallbackErrorMessage={dict.common.saveError}
      resetOnSuccess={false}
    >
      <input type="hidden" name="slogansData" value={serializedData} />

      {/* Roterende Slogans */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-vtk-blue/10 pb-4">
          <div>
            <h2 className="font-semibold text-lg">
              {isNl ? "Roterende slogans" : "Rotating slogans"}
            </h2>
            <p className="text-sm text-[#5c667f]">
              {isNl
                ? "Slogans die afwisselend getoond worden op de landing page. Het accentwoord staat in geel."
                : "Slogans displayed alternately on the landing page hero. The accent word is highlighted in yellow."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={addItem}
            className="self-start sm:self-auto text-sm"
          >
            + {isNl ? "Slogan toevoegen" : "Add slogan"}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            {isNl
              ? "Nog geen slogans toegevoegd. Klik hierboven op '+ Slogan toevoegen'."
              : "No slogans added yet. Click '+ Add slogan' above."}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-xl border border-vtk-blue/15 p-4 bg-white space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-vtk-blue-soft text-xs font-semibold text-vtk-blue">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                      {isNl ? `Slogan ${idx + 1}` : `Slogan ${idx + 1}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                      title={isNl ? "Naar boven" : "Move up"}
                      aria-label={isNl ? "Naar boven" : "Move up"}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === items.length - 1}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                      title={isNl ? "Naar beneden" : "Move down"}
                      aria-label={isNl ? "Naar beneden" : "Move down"}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="rounded p-1 text-rose-600 hover:bg-rose-50 ml-2 text-sm font-medium"
                      title={isNl ? "Verwijderen" : "Delete"}
                      aria-label={isNl ? "Verwijderen" : "Delete"}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-t-nl-${item.id}`}>
                      {isNl ? "Tekst vóór accent (NL)" : "Text before accent (NL)"}
                    </Label>
                    <Input
                      id={`${baseId}-t-nl-${item.id}`}
                      value={item.titleNl}
                      onChange={(e) =>
                        updateItem(idx, { titleNl: e.target.value })
                      }
                      placeholder={isNl ? "bv. Ingenieurs zijn" : "e.g. Engineers are"}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label
                      htmlFor={`${baseId}-a-nl-${item.id}`}
                      className="flex items-center gap-1.5"
                    >
                      <span>{isNl ? "Accentwoord (NL)" : "Accent word (NL)"}</span>
                      <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                        {isNl ? "In 't geel" : "In yellow"}
                      </span>
                    </Label>
                    <Input
                      id={`${baseId}-a-nl-${item.id}`}
                      value={item.accentNl}
                      onChange={(e) =>
                        updateItem(idx, { accentNl: e.target.value })
                      }
                      placeholder={isNl ? "bv. superieur." : "e.g. superior."}
                      className="border-amber-400 focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-tail-nl-${item.id}`}>
                      {isNl ? "Tekst na accent (NL, optioneel)" : "Text after accent (NL, optional)"}
                    </Label>
                    <Input
                      id={`${baseId}-tail-nl-${item.id}`}
                      value={item.tailNl ?? ""}
                      onChange={(e) =>
                        updateItem(idx, { tailNl: e.target.value })
                      }
                      placeholder={isNl ? "bv. in Leuven." : "e.g. in Leuven."}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-t-en-${item.id}`} className="text-zinc-500">
                      {isNl ? "Tekst vóór accent (EN)" : "Text before accent (EN)"}
                    </Label>
                    <Input
                      id={`${baseId}-t-en-${item.id}`}
                      value={item.titleEn ?? ""}
                      onChange={(e) =>
                        updateItem(idx, { titleEn: e.target.value })
                      }
                      placeholder={item.titleNl || (isNl ? "Laat leeg voor NL" : "Leave empty for default")}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-a-en-${item.id}`} className="text-zinc-500">
                      {isNl ? "Accentwoord (EN)" : "Accent word (EN)"}
                    </Label>
                    <Input
                      id={`${baseId}-a-en-${item.id}`}
                      value={item.accentEn ?? ""}
                      onChange={(e) =>
                        updateItem(idx, { accentEn: e.target.value })
                      }
                      placeholder={item.accentNl || (isNl ? "Laat leeg voor NL" : "Leave empty for default")}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`${baseId}-tail-en-${item.id}`} className="text-zinc-500">
                      {isNl ? "Tekst na accent (EN)" : "Text after accent (EN)"}
                    </Label>
                    <Input
                      id={`${baseId}-tail-en-${item.id}`}
                      value={item.tailEn ?? ""}
                      onChange={(e) =>
                        updateItem(idx, { tailEn: e.target.value })
                      }
                      placeholder={item.tailNl || ""}
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <SloganPreviewChip
                    title={item.titleNl}
                    accent={item.accentNl}
                    tail={item.tailNl}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Persoonlijke slogan voor ingelogde leden */}
      <Card className="p-5 space-y-4">
        <div className="border-b border-vtk-blue/10 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">
                {isNl
                  ? "Persoonlijke slogan voor ingelogde leden"
                  : "Personalized slogan for logged-in members"}
              </h2>
              <p className="text-sm text-[#5c667f]">
                {isNl
                  ? "Toon een begroeting op maat met de naam of voornaam van het ingelogde lid."
                  : "Show a customized welcome message with the member's name or first name."}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={personal.enabled}
                onChange={(e) =>
                  setPersonal((prev) => ({ ...prev, enabled: e.target.checked }))
                }
                className="h-4 w-4 rounded border-zinc-300 text-vtk-blue focus:ring-vtk-blue"
              />
              <span className="text-sm font-medium">
                {isNl ? "Ingeschakeld" : "Enabled"}
              </span>
            </label>
          </div>
        </div>

        {personal.enabled ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                {isNl ? "Ondersteunde placeholders:" : "Supported placeholders:"}
              </p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 text-xs">
                <li>
                  <code className="font-bold">{`{firstName}`}</code>:{" "}
                  {isNl
                    ? "Voornaam van het lid (bv. Jan)"
                    : "First name of the member (e.g. Jan)"}
                </li>
                <li>
                  <code className="font-bold">{`{name}`}</code>:{" "}
                  {isNl
                    ? "Volledige naam van het lid (bv. Jan Peeters)"
                    : "Full name of the member (e.g. Jan Peeters)"}
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-t-nl`}>
                  {isNl ? "Tekst vóór accent (NL)" : "Text before accent (NL)"}
                </Label>
                <Input
                  id={`${baseId}-p-t-nl`}
                  value={personal.titleNl}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, titleNl: e.target.value }))
                  }
                  placeholder={isNl ? "bv. Welkom terug," : "e.g. Welcome back,"}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-a-nl`} className="flex items-center gap-1.5">
                  <span>{isNl ? "Accentwoord (NL)" : "Accent word (NL)"}</span>
                  <span className="inline-flex items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    {isNl ? "In 't geel" : "In yellow"}
                  </span>
                </Label>
                <Input
                  id={`${baseId}-p-a-nl`}
                  value={personal.accentNl}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, accentNl: e.target.value }))
                  }
                  placeholder={isNl ? "bv. {firstName}!" : "e.g. {firstName}!"}
                  className="border-amber-400 focus:border-amber-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-tail-nl`}>
                  {isNl ? "Tekst na accent (NL, optioneel)" : "Text after accent (NL, optional)"}
                </Label>
                <Input
                  id={`${baseId}-p-tail-nl`}
                  value={personal.tailNl ?? ""}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, tailNl: e.target.value }))
                  }
                  placeholder={isNl ? "bv. bij VTK." : "e.g. at VTK."}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-t-en`} className="text-zinc-500">
                  {isNl ? "Tekst vóór accent (EN)" : "Text before accent (EN)"}
                </Label>
                <Input
                  id={`${baseId}-p-t-en`}
                  value={personal.titleEn ?? ""}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, titleEn: e.target.value }))
                  }
                  placeholder={personal.titleNl}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-a-en`} className="text-zinc-500">
                  {isNl ? "Accentwoord (EN)" : "Accent word (EN)"}
                </Label>
                <Input
                  id={`${baseId}-p-a-en`}
                  value={personal.accentEn ?? ""}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, accentEn: e.target.value }))
                  }
                  placeholder={personal.accentNl}
                  className="font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${baseId}-p-tail-en`} className="text-zinc-500">
                  {isNl ? "Tekst na accent (EN)" : "Text after accent (EN)"}
                </Label>
                <Input
                  id={`${baseId}-p-tail-en`}
                  value={personal.tailEn ?? ""}
                  onChange={(e) =>
                    setPersonal((prev) => ({ ...prev, tailEn: e.target.value }))
                  }
                  placeholder={personal.tailNl ?? ""}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-zinc-100 space-y-1">
              <Label htmlFor={`${baseId}-p-chance`} className="font-medium text-sm">
                {isNl
                  ? "Weergavekans persoonlijke slogan bij bezoek / herladen"
                  : "Personal slogan chance on page visit / reload"}
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id={`${baseId}-p-chance`}
                  type="number"
                  min={0}
                  max={100}
                  value={personal.chancePercent ?? 50}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setPersonal((prev) => ({
                      ...prev,
                      chancePercent: Number.isFinite(val)
                        ? Math.max(0, Math.min(100, val))
                        : 50,
                    }));
                  }}
                  className="w-24"
                />
                <span className="text-xs text-zinc-500">
                  {isNl
                    ? `% kans (standaard 50% = 50% kans op persoonlijke begroeting, 50% op een roterende slogan).`
                    : `% chance (default 50% = 50% chance for personal greeting, 50% for rotating slogans).`}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center gap-2 mb-2 text-xs text-zinc-500">
                <span>{isNl ? "Voorbeeld-lid naam:" : "Preview member name:"}</span>
                <input
                  type="text"
                  value={previewMemberName}
                  onChange={(e) => setPreviewMemberName(e.target.value)}
                  className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-800"
                />
              </div>
              <SloganPreviewChip
                title={interpolateName(personal.titleNl, previewMemberName, previewFirstName)}
                accent={interpolateName(personal.accentNl, previewMemberName, previewFirstName)}
                tail={interpolateName(personal.tailNl, previewMemberName, previewFirstName)}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-zinc-500 italic">
            {isNl
              ? "Persoonlijke slogan is uitgeschakeld. Ingelogde leden zien dezelfde roterende slogans als gewone bezoekers."
              : "Personalized slogan is disabled. Logged-in members see the same slogans as regular visitors."}
          </p>
        )}
      </Card>

      {/* Rotatie instellingen */}
      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">
            {isNl ? "Rotatie-instellingen" : "Rotation settings"}
          </h2>
          <p className="text-sm text-[#5c667f]">
            {isNl
              ? "Kies hoe vaak de slogan automatisch wisselt en of de volgorde willekeurig is bij herladen."
              : "Choose how often the slogan rotates and whether the start order is randomized on page reload."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-vtk-blue/10">
          <div className="space-y-1">
            <Label htmlFor={`${baseId}-interval`}>
              {isNl
                ? "Wisseltijd in seconden (automatische rotatie)"
                : "Rotation interval in seconds"}
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id={`${baseId}-interval`}
                type="number"
                min={0}
                max={60}
                value={intervalSeconds}
                onChange={(e) => setIntervalSeconds(Number(e.target.value) || 0)}
                className="w-28"
              />
              <span className="text-xs text-zinc-500">
                {intervalSeconds === 0
                  ? isNl
                    ? "0 = alleen bij herladen van de pagina wisselen"
                    : "0 = only rotate upon page reload"
                  : isNl
                    ? `Wisselt elke ${intervalSeconds} seconden`
                    : `Rotates every ${intervalSeconds} seconds`}
              </span>
            </div>
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer mt-4 sm:mt-0">
              <input
                type="checkbox"
                checked={randomizeOnReload}
                onChange={(e) => setRandomizeOnReload(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-vtk-blue focus:ring-vtk-blue"
              />
              <span className="text-sm">
                {isNl
                  ? "Willekeurige start-slogan bij het herladen van de pagina"
                  : "Random initial slogan on page reload"}
              </span>
            </label>
          </div>
        </div>
      </Card>
    </SaveForm>
  );
}
