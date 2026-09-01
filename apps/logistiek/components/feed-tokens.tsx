'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { createFeedTokenAction, revokeFeedTokenAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/uitleen';

/**
 * Agenda-abonnementen op de transportplanning (A1).
 *
 * De URL is het geheim, dus ze bestaat exact één keer: bij het aanmaken. Daarna
 * staat er enkel nog een sha256 in de databank, en kan niemand ze meer opvragen,
 * ook het team niet. Vandaar de nadruk in het scherm en de kopieerknop met een
 * vinkje erna; wie ze wegklikt, maakt gewoon een nieuw abonnement.
 */

export type FeedTokenRow = {
  id: string;
  label: string;
  scope: 'TEAM' | 'DRIVER';
  createdAt: string;
  lastUsedAt: string | null;
};

const SCOPE_LABELS: Record<FeedTokenRow['scope'], string> = {
  TEAM: 'De hele planning',
  DRIVER: 'Enkel mijn ritten',
};

export function FeedTokens({
  tokens,
  canTeam,
  canDriver,
}: {
  tokens: FeedTokenRow[];
  /** Mag deze persoon de volledige planning abonneren? Vraagt `logistiek.manage`. */
  canTeam: boolean;
  /** Staat deze persoon in de chauffeurslijst? */
  canDriver: boolean;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<FeedTokenRow['scope']>(canTeam ? 'TEAM' : 'DRIVER');
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function create() {
    startTransition(async () => {
      const result = await createFeedTokenAction({ label, scope });
      if (result.ok) {
        setFresh(result.url);
        setCopied(false);
        setLabel('');
        showToast({ message: 'Abonnement aangemaakt. Kopieer de link nu.', variant: 'success' });
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      // Geen klembord (onveilige oorsprong, of geweigerd): de link staat er
      // voluit, dus met de hand selecteren werkt nog.
      showToast({ message: 'Kopiëren lukte niet; selecteer de link zelf.', variant: 'error' });
    }
  }

  if (!canTeam && !canDriver) return null;

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Agenda-abonnement</h2>
      <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
        Zet de transportplanning in je eigen agenda (Google, Apple, Outlook). De link is een
        geheim: wie hem heeft, ziet de ritten met adressen en telefoonnummers. Geef hem dus niet
        door; maak liever een tweede abonnement en trek het in wanneer het niet meer nodig is.
      </p>

      {fresh ? (
        <div className="mt-4 grid gap-2 rounded-[14px] border-2 border-vtk-yellow bg-vtk-yellow/10 p-4">
          <p className="text-sm font-semibold text-vtk-ink">
            Kopieer deze link nu; hij is hierna niet meer op te vragen.
          </p>
          <code className="block break-all rounded-lg bg-white px-3 py-2 text-xs text-vtk-ink">
            {fresh}
          </code>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={copy}>
              {copied ? (
                <span className="inline-flex items-center gap-1.5">
                  <LogisticsIcon name="check" className="h-4 w-4" />
                  Gekopieerd
                </span>
              ) : (
                'Kopieer link'
              )}
            </Button>
            <button
              type="button"
              onClick={() => setFresh(null)}
              className="text-sm font-medium text-vtk-muted underline underline-offset-4"
            >
              Klaar
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 rounded-[14px] border border-dashed border-vtk-navy/25 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Waarvoor
          <input
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="bv. mijn gsm"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
          />
        </label>
        {canTeam && canDriver ? (
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Wat erin staat
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value as FeedTokenRow['scope'])}
              className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
            >
              <option value="TEAM">{SCOPE_LABELS.TEAM}</option>
              <option value="DRIVER">{SCOPE_LABELS.DRIVER}</option>
            </select>
          </label>
        ) : null}
        <Button type="button" size="sm" onClick={create} disabled={pending || !label.trim()}>
          {pending ? 'Aanmaken...' : 'Abonnement aanmaken'}
        </Button>
      </div>

      {tokens.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {tokens.map((token) => (
            <li
              key={token.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-paper/60 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-vtk-ink">{token.label}</p>
                <p className="text-xs text-vtk-muted">
                  {SCOPE_LABELS[token.scope]} · aangemaakt{' '}
                  {formatDateTime(new Date(token.createdAt))} ·{' '}
                  {token.lastUsedAt
                    ? `laatst opgehaald ${formatDateTime(new Date(token.lastUsedAt))}`
                    : 'nog nooit opgehaald'}
                </p>
              </div>
              <ConfirmActionButton
                label={`Intrekken: ${token.label}`}
                confirmLabel="Abonnement intrekken"
                icon={<LogisticsIcon name="close" className="h-4 w-4" />}
                action={revokeFeedTokenAction.bind(null, token.id)}
                successMessage="Abonnement ingetrokken."
                destructive
                dialogTitle="Abonnement intrekken?"
                dialogDescription={`De agenda achter "${token.label}" krijgt geen ritten meer binnen; wat er al in staat, blijft er staan tot die agenda ze zelf opruimt. De ritten zelf veranderen niet, en je kan altijd een nieuw abonnement maken.`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-vtk-muted">Je hebt nog geen abonnement.</p>
      )}
    </section>
  );
}
