"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveUrenloopConfigAction } from "@/app/actions/urenloop";
import { URENLOOP_MARKER } from "@/lib/urenloop/stats";

export function UrenloopConfigForm({
  locale,
  startsAt,
  endsAt,
  showResultsUntil,
}: {
  locale: Locale;
  startsAt: string;
  endsAt: string;
  showResultsUntil: string;
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="space-y-6">
      <SaveForm
        action={saveUrenloopConfigAction}
        submitLabel={dict.admin.save}
        savingLabel={nl ? "Opslaan..." : "Saving..."}
        savedMessage={nl ? "24 urenloop opgeslagen." : "24-hour run saved."}
        errorMessages={
          nl
            ? {
                INVALID_DATE: "Controleer de ingevulde datum en tijd.",
                ENDS_BEFORE_START: "De aankomst moet na het startschot liggen.",
                RESULTS_BEFORE_END:
                  "Het moment waarop de eindstand verdwijnt moet na de aankomst liggen.",
              }
            : {
                INVALID_DATE: "Check the entered date and time.",
                ENDS_BEFORE_START: "The finish must be after the start.",
                RESULTS_BEFORE_END:
                  "The moment when results disappear must be after the finish.",
              }
        }
        fallbackErrorMessage={
          nl ? "Opslaan is niet gelukt." : "Could not save the settings."
        }
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="urenloop-starts-at">
              {nl ? "Startschot" : "Start gun"}
            </Label>
            <Input
              id="urenloop-starts-at"
              name="startsAt"
              type="datetime-local"
              defaultValue={startsAt}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? "Waar de aftelklok op de homepage en in [[24urenloop]] naartoe telt."
                : "What the countdown on the front page and in [[24urenloop]] counts down to."}
            </p>
          </div>

          <div>
            <Label htmlFor="urenloop-ends-at">
              {nl ? "Aankomst" : "Finish"}
            </Label>
            <Input
              id="urenloop-ends-at"
              name="endsAt"
              type="datetime-local"
              defaultValue={endsAt}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? "24 uur na de start. Tijdens het laatste uur bevriest het totaal op de site."
                : "24 hours after the start. During the final hour the total on the site freezes."}
            </p>
          </div>

          <div>
            <Label htmlFor="urenloop-results-until">
              {nl ? "Eindstand tonen tot" : "Show results until"}
            </Label>
            <Input
              id="urenloop-results-until"
              name="showResultsUntil"
              type="datetime-local"
              defaultValue={showResultsUntil}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {nl
                ? "Daarna verdwijnt het blok [[24urenloop]] vanzelf van de pagina."
                : "After this moment the [[24urenloop]] block disappears from the page by itself."}
            </p>
          </div>
        </div>
      </SaveForm>

      <div className="border-t border-vtk-blue/10 pt-4">
        <p className="text-sm text-zinc-600">
          {nl
            ? "Zet deze markering op een eigen regel in de tekst van een pagina (bv. /24urenloop) om daar de aftelklok, de live tussenstand en na afloop de eindstand te tonen:"
            : "Put this marker on its own line inside a page's text (e.g. /24urenloop) to show the countdown, live standings, and final results there:"}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-vtk-blue-soft px-2.5 py-1 font-mono text-[13px] text-vtk-ink">
            {URENLOOP_MARKER}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                .writeText(URENLOOP_MARKER)
                .then(() => setCopied(true));
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-vtk-blue/20 px-3 py-1.5 text-sm font-medium text-vtk-ink hover:bg-vtk-blue-soft/50"
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {copied
              ? nl
                ? "Gekopieerd"
                : "Copied"
              : nl
                ? "Markering kopiëren"
                : "Copy marker"}
          </button>
        </div>
      </div>
    </div>
  );
}
