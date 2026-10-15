"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { ExplorerData } from "@/lib/bo/explorer";
import type { BoView } from "@/lib/bo/views";
import { saveBoViewAction } from "@/app/actions/bestuursorgaan";
import { BoExplorer } from "./BoExplorer";
import { BoList } from "./BoList";
import type { Locale } from "./BoParts";

/*
 * De twee weergaven van /admin/bestuursorgaan en de schakelaar ertussen. De
 * keuze wisselt meteen in de browser en wordt op de achtergrond per account
 * bewaard (`UserViewPreference`); de server rendert de volgende keer meteen de
 * gekozen weergave. Beide lezen dezelfde URL, dus wat open stond, blijft open.
 */
export function BoViews({
  data,
  locale,
  errorMessages,
  initialView,
}: {
  data: ExplorerData;
  locale: Locale;
  errorMessages: Record<string, string>;
  initialView: BoView;
}) {
  const nl = locale === "nl";
  const [view, setView] = useState<BoView>(initialView);
  const [, startTransition] = useTransition();
  const showToast = useToast();

  function choose(next: BoView) {
    if (next === view) return;
    setView(next);
    startTransition(async () => {
      const result = await saveBoViewAction(next);
      if (result.status === "error") {
        showToast({
          message: nl
            ? "De weergave is gewisseld, maar niet onthouden: de volgende keer opent de vorige."
            : "The view switched, but was not remembered: next time the previous one opens.",
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  const switcher = (
    <span className="vtk-bo-views" role="group" aria-label={nl ? "Weergave" : "View"}>
      <button type="button" aria-pressed={view === "verkenner"} onClick={() => choose("verkenner")}>
        {nl ? "Verkenner" : "Explorer"}
      </button>
      <button type="button" aria-pressed={view === "lijst"} onClick={() => choose("lijst")}>
        {nl ? "Lijst" : "List"}
      </button>
    </span>
  );

  return view === "lijst" ? (
    <BoList data={data} locale={locale} errorMessages={errorMessages} switcher={switcher} />
  ) : (
    <BoExplorer data={data} locale={locale} errorMessages={errorMessages} switcher={switcher} />
  );
}
