"use client";

import { useState } from "react";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { savePocBandAction } from "@/app/actions/pocs-partners";
import type { PocBandMode, PocBandSetting, PocBandStep } from "@/lib/home/pocBand";

function formatDateTimeLocal(isoString: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function PocBandAdminCard({
  setting,
  locale,
}: {
  setting: PocBandSetting;
  locale: Locale;
}) {
  const [mode, setMode] = useState<PocBandMode>(setting.mode);
  const nl = locale === "nl";

  const [steps, setSteps] = useState<PocBandStep[]>(
    setting.steps.length > 0
      ? setting.steps
      : [
          {
            titleNl: "Kandidaatstelling",
            titleEn: "Put yourself forward",
            bodyNl: "Vul de form in. Je naam en richting komen daarna op de website.",
            bodyEn: "Fill in the form. Your name and programme then go on the website.",
            from: null,
            to: null,
          },
          {
            titleNl: "Bezwarentermijn",
            titleEn: "Objection period",
            bodyNl: "Iedereen kan in deze periode een bezwaar indienen bij het neutraal comité.",
            bodyEn: "During this period anyone can file an objection with the neutral committee.",
            from: null,
            to: null,
          },
          {
            titleNl: "Verkozen of verkiezing",
            titleEn: "Elected, or a vote",
            bodyNl: "Geen bezwaar betekent verkozen. Anders organiseert het neucom een stemming.",
            bodyEn: "No objection means elected. Otherwise the neucom organises a vote.",
            from: null,
            to: null,
          },
        ]
  );

  return (
    <div className="rounded-2xl border border-[#0e1a36]/10 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#10162a]">
          {nl ? "Homepage POC-band" : "Homepage POC band"}
        </h2>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Kies wat er op de homepage getoond wordt: de gekozen studentenvertegenwoordigers of de oproep voor de verkiezingen."
            : "Choose what is shown on the homepage: the elected representatives or the election call."}
        </p>
      </div>

      <SaveForm
        action={savePocBandAction}
        submitLabel={nl ? "Wijzigingen opslaan" : "Save changes"}
        savingLabel={nl ? "Opslaan..." : "Saving..."}
        savedMessage={nl ? "Homepageband bijgewerkt" : "Homepage band updated"}
        fallbackErrorMessage={nl ? "Opslaan is niet gelukt" : "Saving failed"}
        className="space-y-6"
      >
        {/* Modus selectie */}
        <div>
          <label className="block text-sm font-medium text-[#10162a] mb-2">
            {nl ? "Weergavemodus" : "Display mode"}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setMode("elections")}
              className={
                "p-4 rounded-xl border text-left transition " +
                (mode === "elections"
                  ? "border-[#ffd23f] bg-[#fffcf0] ring-2 ring-[#ffd23f]"
                  : "border-[#0e1a36]/10 hover:border-[#0e1a36]/25")
              }
            >
              <div className="font-semibold text-sm text-[#10162a]">
                {nl ? "Verkiezingen" : "Elections"}
              </div>
              <div className="text-xs text-[#5c667f] mt-1">
                {nl
                  ? "Toont oproep, deadline en procedurestappen"
                  : "Shows call, deadline and procedure steps"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("representatives")}
              className={
                "p-4 rounded-xl border text-left transition " +
                (mode === "representatives"
                  ? "border-[#ffd23f] bg-[#fffcf0] ring-2 ring-[#ffd23f]"
                  : "border-[#0e1a36]/10 hover:border-[#0e1a36]/25")
              }
            >
              <div className="font-semibold text-sm text-[#10162a]">
                {nl ? "Vertegenwoordigers" : "Representatives"}
              </div>
              <div className="text-xs text-[#5c667f] mt-1">
                {nl
                  ? "Toont de vertegenwoordigers van je studierichting"
                  : "Shows representatives of your study tracks"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("hidden")}
              className={
                "p-4 rounded-xl border text-left transition " +
                (mode === "hidden"
                  ? "border-[#ffd23f] bg-[#fffcf0] ring-2 ring-[#ffd23f]"
                  : "border-[#0e1a36]/10 hover:border-[#0e1a36]/25")
              }
            >
              <div className="font-semibold text-sm text-[#10162a]">
                {nl ? "Verbergen" : "Hidden"}
              </div>
              <div className="text-xs text-[#5c667f] mt-1">
                {nl ? "Verbergt de band tijdelijk" : "Temporarily hides the band"}
              </div>
            </button>
          </div>
          <input type="hidden" name="mode" value={mode} />
        </div>

        {/* Instellingen voor verkiezingen */}
        <div className={mode === "elections" ? "space-y-6 pt-4 border-t border-[#0e1a36]/10" : "hidden"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Koptekst van de band (NL)" : "Band heading (NL)"}
              </label>
              <input
                type="text"
                name="headingNl"
                defaultValue={setting.headingNl}
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Koptekst van de band (EN)" : "Band heading (EN)"}
              </label>
              <input
                type="text"
                name="headingEn"
                defaultValue={setting.headingEn}
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Regel rechts van kop (NL)" : "Meta text right of heading (NL)"}
              </label>
              <input
                type="text"
                name="metaNl"
                defaultValue={setting.metaNl}
                placeholder="bv. Kandidaatstelling loopt"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Regel rechts van kop (EN)" : "Meta text right of heading (EN)"}
              </label>
              <input
                type="text"
                name="metaEn"
                defaultValue={setting.metaEn}
                placeholder="e.g. Candidacy open"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Titel in paneel (NL)" : "Panel title (NL)"}
              </label>
              <input
                type="text"
                name="titleNl"
                defaultValue={setting.titleNl}
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Titel in paneel (EN)" : "Panel title (EN)"}
              </label>
              <input
                type="text"
                name="titleEn"
                defaultValue={setting.titleEn}
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Uitleg (Markdown, NL)" : "Explanation (Markdown, NL)"}
              </label>
              <MarkdownEditorField
                name="bodyNl"
                defaultValue={setting.bodyNl}
                locale="nl"
                rows={5}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Uitleg (Markdown, EN)" : "Explanation (Markdown, EN)"}
              </label>
              <MarkdownEditorField
                name="bodyEn"
                defaultValue={setting.bodyEn}
                locale="en"
                rows={5}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
              {nl ? "Deadline kandidaatstelling" : "Candidacy deadline"}
            </label>
            <input
              type="datetime-local"
              name="deadline"
              defaultValue={formatDateTimeLocal(setting.deadline)}
              className="rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Voedt de teller (bv. 'Nog 19 dagen') en schakelt de knop op ghost zodra de deadline voorbij is."
                : "Powers the countdown badge and switches the CTA button to ghost once passed."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Hoofdknop tekst (NL)" : "CTA label (NL)"}
              </label>
              <input
                type="text"
                name="ctaLabelNl"
                defaultValue={setting.ctaLabelNl}
                placeholder="Stel je kandidaat"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Hoofdknop tekst (EN)" : "CTA label (EN)"}
              </label>
              <input
                type="text"
                name="ctaLabelEn"
                defaultValue={setting.ctaLabelEn}
                placeholder="Put yourself forward"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Hoofdknop URL" : "CTA URL"}
              </label>
              <input
                type="text"
                name="ctaUrl"
                defaultValue={setting.ctaUrl}
                placeholder="/formulieren/river-kandidaat"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Secundaire knop tekst (NL)" : "Secondary button label (NL)"}
              </label>
              <input
                type="text"
                name="secondaryLabelNl"
                defaultValue={setting.secondaryLabelNl}
                placeholder="Kandidaten bekijken"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Secundaire knop tekst (EN)" : "Secondary button label (EN)"}
              </label>
              <input
                type="text"
                name="secondaryLabelEn"
                defaultValue={setting.secondaryLabelEn}
                placeholder="View candidates"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                {nl ? "Secundaire knop URL" : "Secondary button URL"}
              </label>
              <input
                type="text"
                name="secondaryUrl"
                defaultValue={setting.secondaryUrl}
                placeholder="/pocs"
                className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-2 text-sm focus:border-[#0e1a36] focus:outline-none"
              />
            </div>
          </div>

          {/* Disclaimer op /pocs */}
          <div className="space-y-4 pt-4 border-t border-[#0e1a36]/10">
            <div>
              <h3 className="text-sm font-semibold text-[#10162a]">
                {nl ? "Disclaimer op de POC-pagina" : "Notice on the POC page"}
              </h3>
              <p className="text-xs text-[#5c667f] mt-0.5">
                {nl
                  ? "Staat boven de gezichten op /pocs, maar enkel in verkiezingsmodus en enkel bij het huidige werkingsjaar. Laat beide velden leeg om er geen te tonen."
                  : "Shown above the faces on /pocs, but only in election mode and only for the current working year. Leave both fields empty to show none."}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                  {nl ? "Disclaimer (Markdown, NL)" : "Notice (Markdown, NL)"}
                </label>
                <MarkdownEditorField
                  name="noticeNl"
                  defaultValue={setting.noticeNl}
                  locale="nl"
                  rows={4}
                  allowImages={false}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#5c667f] uppercase tracking-wider mb-1">
                  {nl ? "Disclaimer (Markdown, EN)" : "Notice (Markdown, EN)"}
                </label>
                <MarkdownEditorField
                  name="noticeEn"
                  defaultValue={setting.noticeEn}
                  locale="en"
                  rows={4}
                  allowImages={false}
                />
              </div>
            </div>
          </div>

          {/* Procedure stappen */}
          <div className="space-y-4 pt-4 border-t border-[#0e1a36]/10">
            <div>
              <h3 className="text-sm font-semibold text-[#10162a]">
                {nl ? "Procedurestappen (tijdlijn)" : "Procedure steps (timeline)"}
              </h3>
              <p className="text-xs text-[#5c667f] mt-0.5">
                {nl
                  ? "De actieve stap krijgt automatisch een gele bovenrand op basis van de huidige datum."
                  : "The active step automatically receives a yellow top accent based on today's date."}
              </p>
            </div>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="rounded-xl border border-[#0e1a36]/10 p-4 bg-[#f7f9fc] space-y-3">
                  <div className="text-xs font-bold text-[#5c667f] uppercase tracking-wider">
                    {nl ? `Stap ${idx + 1}` : `Step ${idx + 1}`}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      name={`step-titleNl-${idx}`}
                      defaultValue={step.titleNl}
                      placeholder={nl ? "Titel (NL)" : "Title (NL)"}
                      className="rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                    />
                    <input
                      type="text"
                      name={`step-titleEn-${idx}`}
                      defaultValue={step.titleEn}
                      placeholder={nl ? "Titel (EN)" : "Title (EN)"}
                      className="rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      name={`step-bodyNl-${idx}`}
                      defaultValue={step.bodyNl}
                      placeholder={nl ? "Uitleg (NL)" : "Explanation (NL)"}
                      className="rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                    />
                    <input
                      type="text"
                      name={`step-bodyEn-${idx}`}
                      defaultValue={step.bodyEn}
                      placeholder={nl ? "Uitleg (EN)" : "Explanation (EN)"}
                      className="rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#5c667f] mb-0.5">
                        {nl ? "Vanaf datum" : "From date"}
                      </label>
                      <input
                        type="date"
                        name={`step-from-${idx}`}
                        defaultValue={step.from ?? ""}
                        className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#5c667f] mb-0.5">
                        {nl ? "Tot datum" : "To date"}
                      </label>
                      <input
                        type="date"
                        name={`step-to-${idx}`}
                        defaultValue={step.to ?? ""}
                        className="w-full rounded-lg border border-[#0e1a36]/15 px-3 py-1.5 text-sm bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SaveForm>
    </div>
  );
}
