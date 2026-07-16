import { statusLabel, statusTone, type AdminLocale } from "./format";

export function StatusBadge({ status, locale }: { status: string; locale: AdminLocale }) {
  return (
    <span className="ticket-admin-status" data-tone={statusTone(status)}>
      <span className="ticket-admin-status-dot" aria-hidden="true" />
      {statusLabel(status, locale)}
    </span>
  );
}
