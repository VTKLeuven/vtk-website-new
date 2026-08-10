import {
  RESERVATION_STATUS_LABELS,
  VAN_STATUS_LABELS,
  formatDateTime,
} from '@/lib/uitleen';
import type { UitleenAuditEntry } from '@/lib/uitleen-server';

/**
 * Statuslabel dat bij beide soorten past. De historiek bewaart de status als
 * vrije tekst (materiaal en vervoer hebben elk hun eigen enum), dus we zoeken in
 * beide tabellen en vallen terug op de ruwe waarde.
 */
function statusLabel(status: string): string {
  const known: Record<string, string> = { ...RESERVATION_STATUS_LABELS, ...VAN_STATUS_LABELS };
  return known[status] ?? status;
}

function describe(entry: UitleenAuditEntry): string {
  if (entry.kind === 'STATUS_CHANGED' && entry.toStatus) {
    const from = entry.fromStatus ? `${statusLabel(entry.fromStatus)} → ` : '';
    return `${from}${statusLabel(entry.toStatus)}`;
  }
  if (entry.kind === 'EDITED') return 'Aangepast';
  if (entry.kind === 'PAYMENT_MARKED') return 'Betaling';
  return 'Notitie';
}

/**
 * Wat er met deze aanvraag of rit gebeurd is, oudste eerst.
 *
 * De velden op de aanvraag zelf tonen enkel de huidige toestand; sinds het team
 * een beslissing kan terugdraaien, wil je ook zien dat dat gebeurd is en door wie.
 */
export function AuditTimeline({ entries }: { entries: UitleenAuditEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <section className="rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
      <h3 className="text-sm font-semibold text-vtk-ink">Historiek</h3>
      <ol className="mt-3 grid gap-2.5">
        {entries.map((entry) => (
          <li key={entry.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-sm">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-medium text-vtk-ink">{describe(entry)}</span>
              {entry.note ? <span className="text-vtk-body"> · {entry.note}</span> : null}
              <span className="block text-xs text-vtk-muted">
                {formatDateTime(entry.createdAt)}
                {entry.actor ? ` · ${entry.actor.name}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
