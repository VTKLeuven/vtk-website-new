"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "@vtk/ui";
import {
  createCalendarFeedTokenAction,
  revokeCalendarFeedTokenAction,
} from "@/app/actions/calendarFeed";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

export type CalendarFeedTokenView = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const T = {
  nl: {
    title: "Persoonlijke agenda-feed",
    intro:
      "Zet je VTK-agenda in je eigen kalender-app. Deze feed bevat ook evenementen die enkel voor leden zichtbaar zijn en de shiften waarvoor je ingeschreven bent, en werkt vanzelf bij zodra er iets verandert.",
    label: "Naam van toestel of app",
    placeholder: "Mijn iPhone",
    create: "Feed aanmaken",
    creating: "Aanmaken...",
    invalidLabel: "Geef een naam van maximaal 80 tekens.",
    tooMany: "Je hebt al vijf actieve feeds. Trek er eerst één in.",
    createFailed: "Feed aanmaken mislukt.",
    created: "Feed aangemaakt. Kopieer de link nu; daarna wordt ze niet meer getoond.",
    copy: "Link kopiëren",
    copied: "Link gekopieerd.",
    copyFailed: "Kopiëren mislukt. Selecteer de link handmatig.",
    subscribe: "Toevoegen aan agenda-app",
    active: "Actieve feeds",
    none: "Nog geen persoonlijke feeds.",
    createdAt: "Aangemaakt",
    lastUsed: "Laatst opgehaald",
    never: "Nog nooit",
    revoke: "Intrekken",
    revokeTitle: "Feed intrekken?",
    revokeDescription:
      "De link stopt meteen met werken en de agenda die erop geabonneerd is, krijgt geen updates meer. Je evenementen en shiften zelf veranderen niet; je kan altijd een nieuwe feed aanmaken.",
    revokeConfirm: "Intrekken",
    cancel: "Annuleren",
    revoked: "Feed ingetrokken.",
    warning:
      "Deel deze link met niemand: wie ze heeft, ziet je volledige agenda zonder in te loggen.",
  },
  en: {
    title: "Personal calendar feed",
    intro:
      "Put your VTK calendar in your own calendar app. This feed also carries members-only events and the shifts you signed up for, and updates itself whenever something changes.",
    label: "Device or app name",
    placeholder: "My iPhone",
    create: "Create feed",
    creating: "Creating...",
    invalidLabel: "Enter a name of at most 80 characters.",
    tooMany: "You already have five active feeds. Revoke one first.",
    createFailed: "Could not create the feed.",
    created: "Feed created. Copy the link now; it will not be shown again.",
    copy: "Copy link",
    copied: "Link copied.",
    copyFailed: "Copy failed. Select the link manually.",
    subscribe: "Add to calendar app",
    active: "Active feeds",
    none: "No personal feeds yet.",
    createdAt: "Created",
    lastUsed: "Last fetched",
    never: "Never",
    revoke: "Revoke",
    revokeTitle: "Revoke feed?",
    revokeDescription:
      "The link stops working immediately and the subscribed calendar stops receiving updates. Your events and shifts themselves do not change; you can always create a new feed.",
    revokeConfirm: "Revoke",
    cancel: "Cancel",
    revoked: "Feed revoked.",
    warning: "Do not share this link: anyone who has it sees your full calendar without logging in.",
  },
} as const;

export function CalendarFeedTokens({
  locale,
  tokens,
  origin,
}: {
  locale: "nl" | "en";
  tokens: CalendarFeedTokenView[];
  /** Absolute basis-URL, zodat de getoonde link meteen bruikbaar is. */
  origin: string;
}) {
  const t = T[locale];
  const [label, setLabel] = useState("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function createToken() {
    const form = new FormData();
    form.set("label", label);
    startTransition(async () => {
      try {
        const result = await createCalendarFeedTokenAction(form);
        if (!result.ok) {
          const message = result.error === "invalid_label" ? t.invalidLabel : t.tooMany;
          showToast({ message, variant: "error", duration: 0 });
          return;
        }
        setCreatedUrl(`${origin}${result.url}`);
        setLabel("");
        showToast({ message: t.created, variant: "success", duration: 0 });
      } catch {
        showToast({ message: t.createFailed, variant: "error", duration: 0 });
      }
    });
  }

  async function copyUrl() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      showToast({ message: t.copied, variant: "success" });
    } catch {
      showToast({ message: t.copyFailed, variant: "error", duration: 0 });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-vtk-ink">{t.title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5c667f]">{t.intro}</p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          createToken();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="calendar-feed-label">{t.label}</Label>
          <Input
            id="calendar-feed-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t.placeholder}
            maxLength={80}
            autoComplete="off"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t.creating : t.create}
        </Button>
      </form>

      {createdUrl ? (
        <div className="space-y-3 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-950">{t.created}</p>
          <code className="block break-all rounded-lg bg-white p-3 text-xs text-vtk-ink">
            {createdUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyUrl}>
              <span className="mr-2">
                <CopyIcon />
              </span>
              {t.copy}
            </Button>
            {/* webcal: opent de standaard agenda-app, die dan zelf blijft verversen. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = createdUrl.replace(/^https?:/, "webcal:");
              }}
            >
              {t.subscribe}
            </Button>
          </div>
          <p className="text-xs font-medium text-red-800">{t.warning}</p>
        </div>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-vtk-ink">{t.active}</h3>
        {tokens.length === 0 ? (
          <p className="mt-2 text-sm text-[#5c667f]">{t.none}</p>
        ) : (
          <ul className="mt-2 divide-y divide-vtk-blue/10">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-vtk-ink">{token.label}</div>
                  <div className="mt-1 text-xs text-[#5c667f]">
                    {t.createdAt}: {token.createdAt} · {t.lastUsed}: {token.lastUsedAt ?? t.never}
                  </div>
                </div>
                <DeleteIconButton
                  action={revokeCalendarFeedTokenAction}
                  fields={{ id: token.id }}
                  label={t.revoke}
                  srLabel={`${t.revoke}: ${token.label}`}
                  title={t.revokeTitle}
                  description={t.revokeDescription}
                  confirmLabel={t.revokeConfirm}
                  cancelLabel={t.cancel}
                  successMessage={t.revoked}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
