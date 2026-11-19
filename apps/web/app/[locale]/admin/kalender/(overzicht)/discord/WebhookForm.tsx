"use client";

import { Button, Input, Label } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveDiscordWebhookAction } from "@/app/actions/discord";

/**
 * Een webhook toevoegen of de naam en URL van een bestaande wijzigen.
 *
 * De URL staat bij het bewerken bewust leeg: het is een geheim, en het beheer
 * krijgt hem nooit te zien. Leeg laten houdt de huidige.
 */
export function WebhookForm({
  locale,
  webhook,
  onSuccess,
  onCancel,
}: {
  locale: Locale;
  webhook?: { id: string; name: string };
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const nl = locale === "nl";
  const editing = Boolean(webhook);

  return (
    <SaveForm
      action={saveDiscordWebhookAction}
      submitLabel={editing ? (nl ? "Opslaan" : "Save") : nl ? "Webhook toevoegen" : "Add webhook"}
      savingLabel={nl ? "Discord nakijken..." : "Checking with Discord..."}
      savedMessage={
        editing
          ? nl
            ? "Webhook opgeslagen"
            : "Webhook saved"
          : nl
            ? "Webhook toegevoegd. Evenementen met een banner komen voortaan twee weken op voorhand in het kanaal."
            : "Webhook added. Events with a banner will now appear in the channel two weeks ahead."
      }
      errorMessages={{
        INVALID_INPUT: nl ? "Geef de webhook een naam." : "Give the webhook a name.",
        INVALID_WEBHOOK_URL: nl
          ? "Dat is geen Discord-webhook-URL. Ze begint met https://discord.com/api/webhooks/."
          : "That is not a Discord webhook URL. It starts with https://discord.com/api/webhooks/.",
        WEBHOOK_EXISTS: nl
          ? "Deze webhook staat er al; elk kanaal krijgt elke post maar één keer."
          : "This webhook already exists; each channel gets every post only once.",
      }}
      fallbackErrorMessage={nl ? "De webhook kon niet opgeslagen worden." : "The webhook could not be saved."}
      onSuccess={onSuccess}
      resetOnSuccess={!editing}
      footer={({ submitButton }) => (
        <div className="flex flex-wrap items-center gap-2">
          {submitButton}
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
          ) : null}
        </div>
      )}
      className="space-y-4"
    >
      {webhook ? <input type="hidden" name="id" value={webhook.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <Label htmlFor={`discord-name-${webhook?.id ?? "new"}`}>{nl ? "Naam" : "Name"}</Label>
          <Input
            id={`discord-name-${webhook?.id ?? "new"}`}
            name="name"
            required
            maxLength={80}
            defaultValue={webhook?.name}
            placeholder={nl ? "Studentendiscord #evenementen" : "Student Discord #events"}
          />
        </div>
        <div>
          <Label htmlFor={`discord-url-${webhook?.id ?? "new"}`}>Webhook-URL</Label>
          <Input
            id={`discord-url-${webhook?.id ?? "new"}`}
            name="url"
            required={!editing}
            autoComplete="off"
            spellCheck={false}
            placeholder={
              editing
                ? nl
                  ? "Leeg laten om de huidige te houden"
                  : "Leave empty to keep the current one"
                : "https://discord.com/api/webhooks/..."
            }
          />
        </div>
      </div>
      {!editing ? (
        <p className="text-sm text-vtk-muted">
          {nl
            ? "In Discord: Kanaal bewerken, Integraties, Webhooks, Nieuwe webhook, en dan Webhook-URL kopiëren. De naam en avatar die je daar kiest, maken niet uit: elke post verschijnt als VTK Kalender met het schild."
            : "In Discord: Edit channel, Integrations, Webhooks, New webhook, then Copy webhook URL. The name and avatar you pick there do not matter: every post appears as VTK Kalender with the shield."}
        </p>
      ) : null}
    </SaveForm>
  );
}
