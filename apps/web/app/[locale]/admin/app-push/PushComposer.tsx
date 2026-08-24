"use client";

import { useState } from "react";

import { SaveForm } from "@/components/ui/SaveForm";
import { sendAppPushAction } from "@/app/actions/appPush";

export type PushAudience = {
  /** Lege string = iedereen met de app. */
  code: string;
  label: string;
  /** Enkel bekend voor "iedereen"; per post zou dat een telling per keuze vragen. */
  count: number | null;
};

/**
 * Het venstertje om een pushbericht op te stellen.
 *
 * Twee dingen zijn hier bewust anders dan bij een gewoon formulier. De knop zegt
 * **"Versturen naar N toestellen"** en niet "Opslaan": wat er gebeurt is
 * onomkeerbaar, en het aantal hoort in de knop te staan die je indrukt. En er
 * staat een voorbeeld boven, want een pushbericht is korter dan het veld en je
 * ziet pas op een telefoon dat je titel afgekapt wordt.
 */
export function PushComposer({
  locale,
  audiences,
  deviceCount,
}: {
  locale: "nl" | "en";
  audiences: PushAudience[];
  deviceCount: number;
}) {
  const nl = locale === "nl";
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [group, setGroup] = useState("");

  const audience = audiences.find((item) => item.code === group);
  const target =
    audience && audience.count !== null
      ? nl
        ? `${audience.count} toestel${audience.count === 1 ? "" : "len"}`
        : `${audience.count} device${audience.count === 1 ? "" : "s"}`
      : (audience?.label ?? "");

  return (
    <SaveForm
      action={sendAppPushAction}
      submitLabel={nl ? `Versturen naar ${target}` : `Send to ${target}`}
      savingLabel={nl ? "Versturen" : "Sending"}
      savedMessage={nl ? "Het bericht is verstuurd" : "The message was sent"}
      submitDisabled={title.trim().length < 3 || body.trim().length < 3 || deviceCount === 0}
      resetOnSuccess={false}
      errorMessages={{
        INVALID_MESSAGE: nl
          ? "Titel en tekst moeten minstens drie tekens lang zijn."
          : "Title and text need at least three characters.",
        NO_RECIPIENTS: nl
          ? "Er is niemand met de app in deze groep."
          : "Nobody in this group has the app.",
        SEND_FAILED: nl
          ? "Er is niets aangekomen. Kijk de logs na."
          : "Nothing was delivered. Check the logs.",
      }}
      fallbackErrorMessage={nl ? "Versturen is niet gelukt" : "Sending failed"}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">{nl ? "Naar" : "To"}</span>
          <select
            name="groupCode"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {audiences.map((item) => (
              <option key={item.code || "all"} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">{nl ? "Titel" : "Title"}</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">{nl ? "Tekst" : "Text"}</span>
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={240}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">
            {nl ? "Opent in de app (optioneel)" : "Opens in the app (optional)"}
          </span>
          <input
            name="path"
            placeholder="/kalender"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
          <span className="text-vtk-blue-muted mt-1 block text-xs">
            {nl
              ? "Een pad in de app, zoals /kalender of /bestellen. Leeg laten opent gewoon de app."
              : "A path inside the app, such as /kalender. Leave empty to just open the app."}
          </span>
        </label>

        {/* Het voorbeeld: een pushbericht is korter dan het veld, en je merkt op
            een telefoon pas dat je titel afgekapt wordt. */}
        <div className="rounded-xl border bg-vtk-surface p-3">
          <div className="text-vtk-blue-muted text-xs uppercase tracking-wide">
            {nl ? "Zo ziet het eruit" : "How it looks"}
          </div>
          <div className="mt-2 truncate text-sm font-semibold">
            {title.trim() || (nl ? "Titel" : "Title")}
          </div>
          <div className="text-vtk-blue-muted line-clamp-2 text-sm">
            {body.trim() || (nl ? "De tekst van je bericht." : "The text of your message.")}
          </div>
        </div>

        {deviceCount === 0 ? (
          <p className="text-vtk-blue-muted text-sm">
            {nl
              ? "Er heeft nog niemand de app met pushberichten aanstaan."
              : "Nobody has the app with notifications enabled yet."}
          </p>
        ) : null}
      </div>
    </SaveForm>
  );
}
