"use client";

import { UNSENT, unsentGuard } from "@/components/ui/unsentGuard";
import { useState, useTransition } from "react";
import { Button, Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { ExternalLinkIcon, PencilIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import {
  deleteDiscordWebhookAction,
  setDiscordWebhookEnabledAction,
  testDiscordWebhookAction,
} from "@/app/actions/discord";
import { DISCORD_AVATAR_PATH } from "@/lib/discord/eventMessage";
import { WebhookForm } from "./WebhookForm";

export type WebhookCardData = {
  id: string;
  name: string;
  enabled: boolean;
  /** Al geschreven door de server: "12 okt 2026, 14:03". */
  autoSinceLabel: string;
  discordName: string | null;
  channelUrl: string | null;
  lastError: string | null;
  lastErrorLabel: string | null;
  posts: number;
  infoClicks: number;
  linkClicks: number;
};

/**
 * Eén kanaal: wat het is, of het vanzelf post, wat het opleverde, en de
 * handelingen erop. Het getal waar het om draait (hoeveel mensen er klikten)
 * staat naast het aantal posts, zodat het iets betekent.
 */
export function WebhookCard({ locale, webhook }: { locale: Locale; webhook: WebhookCardData }) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(webhook.enabled);
  const [prevEnabled, setPrevEnabled] = useState(webhook.enabled);
  const [toggling, startToggle] = useTransition();
  const [testing, startTest] = useTransition();

  if (webhook.enabled !== prevEnabled) {
    setPrevEnabled(webhook.enabled);
    setEnabled(webhook.enabled);
  }

  const clicks = webhook.infoClicks + webhook.linkClicks;
  const perPost = webhook.posts > 0 ? clicks / webhook.posts : 0;

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    const form = new FormData();
    form.append("id", webhook.id);
    form.append("enabled", String(next));
    startToggle(async () => {
      const result = await unsentGuard.run(() => setDiscordWebhookEnabledAction(SAVE_IDLE, form));
      if (result === UNSENT) {
        setEnabled(!next);
        return;
      }
      if (result.status === "error") {
        setEnabled(!next);
        showToast({
          message: nl ? "Vanzelf posten kon niet gewijzigd worden." : "Automatic posting could not be changed.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: next
          ? nl
            ? `${webhook.name}: nieuwe evenementen komen weer vanzelf in het kanaal`
            : `${webhook.name}: new events are posted automatically again`
          : nl
            ? `${webhook.name}: vanzelf posten staat uit`
            : `${webhook.name}: automatic posting is off`,
        variant: "success",
      });
    });
  }

  function test() {
    const form = new FormData();
    form.append("id", webhook.id);
    startTest(async () => {
      const result = await unsentGuard.run(() => testDiscordWebhookAction(SAVE_IDLE, form));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message: result.detail ?? (nl ? "Het testbericht kwam niet aan." : "The test message did not arrive."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({
        message: nl ? `Testbericht verstuurd naar ${webhook.name}` : `Test message sent to ${webhook.name}`,
        variant: "success",
      });
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* Het schild waaronder elke post verschijnt. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={DISCORD_AVATAR_PATH} alt="" className="mt-0.5 size-10 shrink-0 rounded-full border border-vtk-blue/10 object-cover" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-vtk-ink">{webhook.name}</h2>
            <p className="text-sm text-vtk-muted">
              {webhook.discordName
                ? nl
                  ? `Webhook "${webhook.discordName}" in Discord`
                  : `Webhook "${webhook.discordName}" in Discord`
                : nl
                  ? "Webhook in Discord"
                  : "Webhook in Discord"}
              {webhook.channelUrl ? (
                <>
                  {" "}
                  <a
                    href={webhook.channelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-vtk-ink underline-offset-4 hover:underline"
                  >
                    {nl ? "Open kanaal" : "Open channel"}
                    <ExternalLinkIcon />
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={nl ? "Bewerken" : "Edit"}
            srLabel={`${nl ? "Bewerken" : "Edit"}: ${webhook.name}`}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            <PencilIcon />
          </IconButton>
          <DeleteIconButton
            label={nl ? "Verwijderen" : "Delete"}
            srLabel={`${nl ? "Verwijderen" : "Delete"}: ${webhook.name}`}
            action={deleteDiscordWebhookAction}
            fields={{ id: webhook.id }}
            title={nl ? "Webhook verwijderen?" : "Delete webhook?"}
            description={
              nl
                ? `"${webhook.name}" krijgt geen nieuwe evenementen meer, en de klikcijfers van zijn ${webhook.posts} posts verdwijnen mee. De berichten die al in Discord staan, blijven daar staan; hun knoppen sturen voortaan naar de kalender in plaats van naar het evenement. De webhook zelf blijft in Discord bestaan tot je hem daar in de kanaalinstellingen schrapt.`
                : `"${webhook.name}" gets no new events anymore, and the click figures of its ${webhook.posts} posts are deleted with it. The messages already in Discord stay there; their buttons will lead to the calendar instead of the event. The webhook itself keeps existing in Discord until you remove it in the channel settings.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Webhook verwijderd" : "Webhook deleted"}
          />
        </div>
      </div>

      {editing ? (
        <div className="rounded-xl border border-vtk-blue/10 bg-vtk-blue-soft/30 p-4">
          <WebhookForm
            locale={locale}
            webhook={{ id: webhook.id, name: webhook.name }}
            onSuccess={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-vtk-blue/10 py-3 sm:grid-cols-4">
        <Stat label={nl ? "Gepost" : "Posted"} value={webhook.posts} />
        <Stat label={nl ? "Kliks op Meer info" : "Clicks on More info"} value={webhook.infoClicks} />
        <Stat label={nl ? "Kliks op inschrijven of tickets" : "Clicks on sign-up or tickets"} value={webhook.linkClicks} />
        <Stat
          label={nl ? "Kliks per post" : "Clicks per post"}
          value={webhook.posts > 0 ? perPost.toLocaleString(nl ? "nl-BE" : "en-GB", { maximumFractionDigits: 1 }) : "-"}
        />
      </dl>

      {webhook.lastError ? (
        <div role="alert" className="rounded-xl border border-vtk-danger-line bg-vtk-danger-soft px-4 py-3 text-sm text-vtk-danger">
          <span className="font-semibold">{nl ? "Laatste fout" : "Last error"}</span>
          {webhook.lastErrorLabel ? ` (${webhook.lastErrorLabel})` : null}: {webhook.lastError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={toggling}
          onClick={toggle}
          className="group inline-flex items-center gap-3 text-left text-sm disabled:opacity-60"
        >
          <span
            aria-hidden
            className={[
              "relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors",
              enabled ? "border-vtk-ink bg-vtk-ink" : "border-vtk-blue/20 bg-vtk-blue-soft",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-0.5 size-[18px] rounded-full shadow-sm transition-transform",
                enabled ? "translate-x-[22px] bg-vtk-yellow" : "translate-x-0.5 bg-[var(--surface)]",
              ].join(" ")}
            />
          </span>
          <span>
            <span className="block font-medium text-vtk-ink">{nl ? "Vanzelf posten" : "Post automatically"}</span>
            <span className="block text-xs text-vtk-muted">
              {enabled
                ? nl
                  ? `Twee weken op voorhand, met banner (aan sinds ${webhook.autoSinceLabel})`
                  : `Two weeks ahead, with a banner (on since ${webhook.autoSinceLabel})`
                : nl
                  ? "Uit: enkel met de hand en testberichten"
                  : "Off: only by hand and test messages"}
            </span>
          </span>
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={test} disabled={testing}>
          {testing ? (nl ? "Versturen..." : "Sending...") : nl ? "Testbericht sturen" : "Send test message"}
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs text-vtk-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-vtk-ink">{value}</dd>
    </div>
  );
}
