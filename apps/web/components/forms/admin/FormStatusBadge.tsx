import { formStatusLabel, formStatusTone, type AdminLocale } from "./format";

export function FormStatusBadge({
  status,
  locale,
  label,
}: {
  status: string;
  locale: AdminLocale;
  /** Een eigen naam voor de status; zie `statusLabels` in EntryReviewForm. */
  label?: string;
}) {
  return (
    <span className="ticket-admin-status" data-tone={formStatusTone(status)}>
      <span className="ticket-admin-status-dot" aria-hidden="true" />
      {label ?? formStatusLabel(status, locale)}
    </span>
  );
}
