import { formStatusLabel, formStatusTone, type AdminLocale } from "./format";

export function FormStatusBadge({ status, locale }: { status: string; locale: AdminLocale }) {
  return (
    <span className="ticket-admin-status" data-tone={formStatusTone(status)}>
      <span className="ticket-admin-status-dot" aria-hidden="true" />
      {formStatusLabel(status, locale)}
    </span>
  );
}
