"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label } from "@vtk/ui";
import {
  createDoorShortcutTokenAction,
  revokeDoorShortcutTokenAction,
} from "@/app/actions/door";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

export type DoorShortcutTokenView = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
};

const ENDPOINT = "https://vtk.be/api/door/shortcut/open";

const T = {
  nl: {
    title: "Apple Shortcut voor de deur",
    intro:
      "Open de deur via vtk.be zonder Tailscale of SSH op je iPhone. Elk token is persoonlijk, intrekbaar en blijft alleen geldig zolang je door.remoteOpen hebt.",
    label: "Naam van toestel of Shortcut",
    placeholder: "Mijn iPhone",
    create: "Token aanmaken",
    creating: "Aanmaken...",
    invalidLabel: "Geef een naam van maximaal 80 tekens.",
    tooMany: "Je hebt al vijf actieve tokens. Trek er eerst één in.",
    createFailed: "Token aanmaken mislukt.",
    created: "Token aangemaakt. Kopieer het nu; daarna wordt het niet meer getoond.",
    copy: "Token kopiëren",
    copied: "Token gekopieerd.",
    copyFailed: "Kopiëren mislukt. Selecteer het token handmatig.",
    shortcutTitle: "Shortcut instellen",
    shortcutSteps: [
      "Voeg ‘Haal inhoud van URL op’ toe.",
      `Gebruik POST naar ${ENDPOINT}.`,
      "Voeg de header Authorization toe met waarde Bearer gevolgd door een spatie en dit token.",
      "Toon op basis van het JSON-veld ok een succes- of foutmelding.",
    ],
    active: "Actieve tokens",
    none: "Nog geen actieve Shortcut-tokens.",
    createdAt: "Aangemaakt",
    expiresAt: "Vervalt",
    lastUsed: "Laatst gebruikt",
    never: "Nog nooit",
    revoke: "Intrekken",
    revokeTitle: "Shortcut-token intrekken?",
    revokeDescription: "De Shortcut kan daarna niet meer gebruikt worden met dit token.",
    revokeConfirm: "Intrekken",
    cancel: "Annuleren",
    revoked: "Shortcut-token ingetrokken.",
    warning: "Deel een Shortcut waarin dit token staat nooit met anderen.",
  },
  en: {
    title: "Apple Shortcut for the door",
    intro:
      "Open the door through vtk.be without Tailscale or SSH on your iPhone. Every token is personal, revocable, and only works while you have door.remoteOpen.",
    label: "Device or Shortcut name",
    placeholder: "My iPhone",
    create: "Create token",
    creating: "Creating...",
    invalidLabel: "Enter a name of at most 80 characters.",
    tooMany: "You already have five active tokens. Revoke one first.",
    createFailed: "Could not create the token.",
    created: "Token created. Copy it now; it will not be shown again.",
    copy: "Copy token",
    copied: "Token copied.",
    copyFailed: "Copy failed. Select the token manually.",
    shortcutTitle: "Configure the Shortcut",
    shortcutSteps: [
      "Add ‘Get Contents of URL’.",
      `Use POST to ${ENDPOINT}.`,
      "Add an Authorization header whose value is Bearer, a space, and this token.",
      "Use the JSON field ok to show a success or error notification.",
    ],
    active: "Active tokens",
    none: "No active Shortcut tokens yet.",
    createdAt: "Created",
    expiresAt: "Expires",
    lastUsed: "Last used",
    never: "Never",
    revoke: "Revoke",
    revokeTitle: "Revoke Shortcut token?",
    revokeDescription: "The Shortcut will no longer work with this token.",
    revokeConfirm: "Revoke",
    cancel: "Cancel",
    revoked: "Shortcut token revoked.",
    warning: "Never share a Shortcut that contains this token.",
  },
} as const;

export function DoorShortcutTokens({
  locale,
  tokens,
}: {
  locale: "nl" | "en";
  tokens: DoorShortcutTokenView[];
}) {
  const t = T[locale];
  const [label, setLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  function createToken() {
    const form = new FormData();
    form.set("label", label);
    startTransition(async () => {
      try {
        const result = await createDoorShortcutTokenAction(form);
        if (!result.ok) {
          const message = result.error === "invalid_label" ? t.invalidLabel : t.tooMany;
          showToast({ message, variant: "error", duration: 0 });
          return;
        }
        setCreatedToken(result.token);
        setLabel("");
        showToast({ message: t.created, variant: "success", duration: 0 });
      } catch {
        showToast({ message: t.createFailed, variant: "error", duration: 0 });
      }
    });
  }

  async function copyToken() {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      showToast({ message: t.copied, variant: "success" });
    } catch {
      showToast({ message: t.copyFailed, variant: "error", duration: 0 });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-vtk-ink">{t.title}</h2>
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
          <Label htmlFor="door-shortcut-label">{t.label}</Label>
          <Input
            id="door-shortcut-label"
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

      {createdToken ? (
        <div className="space-y-3 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-yellow-950">{t.created}</p>
          <code className="block break-all rounded-lg bg-white p-3 text-xs text-vtk-ink">
            {createdToken}
          </code>
          <Button type="button" variant="secondary" size="sm" onClick={copyToken}>
            <span className="mr-2"><CopyIcon /></span>
            {t.copy}
          </Button>
          <p className="text-xs font-medium text-red-800">{t.warning}</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-4">
        <h3 className="text-sm font-semibold text-vtk-ink">{t.shortcutTitle}</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[#34405e]">
          {t.shortcutSteps.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>

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
                    {t.createdAt}: {token.createdAt} · {t.expiresAt}: {token.expiresAt} · {t.lastUsed}: {token.lastUsedAt ?? t.never}
                  </div>
                </div>
                <DeleteIconButton
                  action={revokeDoorShortcutTokenAction}
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
