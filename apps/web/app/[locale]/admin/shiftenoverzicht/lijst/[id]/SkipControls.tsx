"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useRef, useState, useTransition } from "react";
import { Input } from "@vtk/ui";
import { EyeIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { SearchPicker } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { setPraesidiumShiftSkipAction, skipPraesidiumShiftPostAction } from "@/app/actions/praesidiumShifts";

/*
 * Iemand op deze lijst overslaan (0%), voor een deel laten meetellen (50%) of
 * weer volledig (100%). Niets verdwijnt: de vakjes blijven staan, ze tellen
 * enkel minder of niet. Daarom geen bevestiging, wel een toast.
 */

/** Het percentage zoals de server het afrondt, of null als het geen getal van 0 tot 100 is. */
function parsePercent(value: string): number | null {
  const raw = value.trim().replace(/%$/, "").trim().replace(",", ".");
  const percent = Number(raw);
  if (!raw || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round(percent);
}

function weightMessage(nl: boolean, name: string, percent: number): string {
  if (percent >= 100) return nl ? `${name} telt weer volledig mee op deze lijst.` : `${name} counts in full on this list again.`;
  if (percent === 0) return nl ? `${name} wordt overgeslagen op deze lijst.` : `${name} is skipped on this list.`;
  return nl ? `${name} telt voor ${percent}% op deze lijst.` : `${name} counts for ${percent}% on this list.`;
}

function useSetWeight(locale: "nl" | "en", listId: string, errorMessages: Record<string, string>) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  /** Slaat op en meldt de uitkomst; `onError` zet het veld terug. */
  function setWeight(userId: string, name: string, percentInput: string, onError?: () => void) {
    const percent = parsePercent(percentInput);
    if (percent === null) {
      showToast({ message: errorMessages.INVALID_PERCENT, variant: "error", duration: 0 });
      onError?.();
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("listId", listId);
      data.set("userIds", userId);
      data.set("percent", String(percent));
      const result = await unsentGuard.run(() => setPraesidiumShiftSkipAction(data));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message: errorMessages[result.code] ?? (nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."),
          variant: "error",
          duration: 0,
        });
        onError?.();
        return;
      }
      showToast({ message: weightMessage(nl, name, percent), variant: "success" });
    });
  }

  return { setWeight, pending };
}

/** Het percentage van iemand die al minder of niet meetelt; slaat op bij Enter of wanneer je het veld verlaat. */
export function WeightInput({
  locale,
  listId,
  userId,
  name,
  weight,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  userId: string;
  name: string;
  weight: number;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const saved = String(Math.round(weight * 100));
  const [value, setValue] = useState(saved);
  // Wat er laatst verstuurd is. Chrome stuurt nog een blur wanneer het veld na
  // het opslaan vervangen wordt; zonder dit sloeg het twee keer op.
  const sent = useRef(saved);
  const { setWeight, pending } = useSetWeight(locale, listId, errorMessages);

  function commit() {
    if (value.trim() === sent.current) return;
    sent.current = value.trim();
    setWeight(userId, name, value, () => {
      sent.current = saved;
      setValue(saved);
    });
  }

  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-vtk-muted">
      {nl ? "telt voor" : "counts for"}
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          // Opslaan gebeurt in onBlur, zodat Enter en wegklikken samen maar één keer opslaan.
          e.currentTarget.blur();
        }}
        disabled={pending}
        aria-label={nl ? `Telt voor hoeveel procent: ${name}` : `Counts for what percentage: ${name}`}
        className="h-8 w-16! text-right tabular-nums"
      />
      %
    </label>
  );
}

/** Iemand weer volledig laten meetellen op deze lijst. */
export function CountFullyButton({
  locale,
  listId,
  userId,
  name,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  userId: string;
  name: string;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const { setWeight, pending } = useSetWeight(locale, listId, errorMessages);
  const label = nl ? "Weer volledig laten meetellen" : "Count in full again";
  return (
    <IconButton label={label} srLabel={`${label}: ${name}`} onClick={() => setWeight(userId, name, "100")} disabled={pending}>
      <EyeIcon />
    </IconButton>
  );
}

/**
 * Een hele post of één persoon toevoegen, voor het percentage dat ervoor
 * staat: 0 is overslaan ("Logistiek" op 24UL), 50 telt voor de helft.
 */
export function SkipAddControls({
  locale,
  listId,
  posts,
  people,
  errorMessages,
}: {
  locale: "nl" | "en";
  listId: string;
  posts: { id: string; name: string; members: number }[];
  /** Wie nu volledig meetelt. */
  people: { userId: string; name: string; posts: string[] }[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [percent, setPercent] = useState("0");
  const parsed = parsePercent(percent);
  const skip = parsed === 0;
  const { setWeight, pending } = useSetWeight(locale, listId, errorMessages);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
        {nl ? "Telt voor" : "Counts for"}
        <Input
          inputMode="numeric"
          value={percent}
          onChange={(e) => setPercent(e.currentTarget.value)}
          aria-label={nl ? "Telt voor hoeveel procent" : "Counts for what percentage"}
          className="h-9 w-16! text-right tabular-nums"
        />
        %
      </label>
      <SaveForm
        action={skipPraesidiumShiftPostAction}
        submitLabel={skip ? (nl ? "Post overslaan" : "Skip post") : nl ? `Post op ${parsed ?? "?"}%` : `Post at ${parsed ?? "?"}%`}
        submitVariant="ghost"
        savingLabel={nl ? "Bezig..." : "Working..."}
        savedMessage={nl ? "Opgeslagen." : "Saved."}
        errorMessages={errorMessages}
        fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
        className="flex flex-wrap items-center gap-2"
        footer={({ submitButton }) => submitButton}
      >
        <input type="hidden" name="listId" value={listId} />
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="percent" value={percent} />
        <div className="w-64">
          <SearchPicker
            name="groupId"
            options={posts.map((p) => ({
              value: p.id,
              label: p.name,
              hint: nl ? `${p.members} ${p.members === 1 ? "lid" : "leden"}` : `${p.members} members`,
            }))}
            placeholder={nl ? "Hele post..." : "Whole post..."}
            searchPlaceholder={nl ? "Typ een post, bv. logistiek" : "Type a post, e.g. logistics"}
            ariaLabel={nl ? "Welke post?" : "Which post?"}
            emptyText={(q) => (nl ? `Geen post gevonden voor "${q}".` : `No post found for "${q}".`)}
          />
        </div>
      </SaveForm>
      <span className="text-xs text-vtk-muted">{nl ? "of" : "or"}</span>
      <div className="w-64">
        <SearchPicker
          key={people.length}
          value=""
          onChange={(userId) => {
            const person = people.find((p) => p.userId === userId);
            if (person) setWeight(person.userId, person.name, percent);
          }}
          disabled={pending}
          options={people.map((p) => ({ value: p.userId, label: p.name, hint: p.posts.join(", ") || undefined }))}
          placeholder={skip ? (nl ? "Iemand overslaan..." : "Skip someone...") : nl ? `Iemand op ${parsed ?? "?"}%...` : `Someone at ${parsed ?? "?"}%...`}
          searchPlaceholder={nl ? "Typ een naam of post" : "Type a name or post"}
          ariaLabel={nl ? "Wie?" : "Who?"}
          emptyText={(q) => (nl ? `Niemand past bij "${q}".` : `Nobody matches "${q}".`)}
        />
      </div>
    </div>
  );
}
