"use client";

import { useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
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
      savingLabel={nl ? "Versturen..." : "Sending..."}
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
      className="space-y-4"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="push-group">{nl ? "Naar" : "To"}</Label>
          <Select
            id="push-group"
            name="groupCode"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            {audiences.map((item) => (
              <option key={item.code || "all"} value={item.code}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="push-title">{nl ? "Titel" : "Title"}</Label>
          <Input
            id="push-title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            placeholder={nl ? "Titel van het bericht" : "Message title"}
          />
        </div>

        <div>
          <Label htmlFor="push-body">{nl ? "Tekst" : "Text"}</Label>
          <Textarea
            id="push-body"
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={240}
            rows={3}
            placeholder={nl ? "Schrijf hier je bericht..." : "Write your message here..."}
          />
        </div>

        <div>
          <Label htmlFor="push-path">
            {nl ? "Opent in de app (optioneel)" : "Opens in the app (optional)"}
          </Label>
          <Input
            id="push-path"
            name="path"
            placeholder="/kalender"
          />
          <p className="mt-1 text-xs text-zinc-500">
            {nl
              ? "Een pad in de app, zoals /kalender of /bestellen. Leeg laten opent gewoon de app."
              : "A path inside the app, such as /kalender. Leave empty to just open the app."}
          </p>
        </div>

        {/* Het voorbeeld: een pushbericht is korter dan het veld, en je merkt op
            een telefoon pas dat je titel afgekapt wordt. */}
        <div>
          <Label>{nl ? "Voorbeeldweergave" : "Preview"}</Label>
          <div className="rounded-2xl border border-vtk-blue/12 bg-white/70 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-vtk-blue/10 pb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-vtk-yellow" />
                {nl ? "VTK App" : "VTK App"}
              </span>
              <span className="font-normal lowercase text-zinc-400">{nl ? "zojuist" : "just now"}</span>
            </div>
            <div className="mt-2.5">
              <div className="truncate text-sm font-semibold text-vtk-ink">
                {title.trim() || (nl ? "Titel" : "Title")}
              </div>
              <div className="mt-0.5 line-clamp-2 text-sm text-zinc-600">
                {body.trim() || (nl ? "De tekst van je bericht." : "The text of your message.")}
              </div>
            </div>
          </div>
        </div>

        {deviceCount === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            {nl
              ? "Er heeft nog niemand de app met pushberichten aanstaan."
              : "Nobody has the app with notifications enabled yet."}
          </div>
        ) : null}
      </div>
    </SaveForm>
  );
}
