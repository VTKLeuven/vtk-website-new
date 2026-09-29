import { Lock } from "lucide-react";
import { statusLabel, statusTone, type AdminLocale } from "./format";

export function StatusBadge({ status, locale }: { status: string; locale: AdminLocale }) {
  return (
    <span className="ticket-admin-status" data-tone={statusTone(status)}>
      <span className="ticket-admin-status-dot" aria-hidden="true" />
      {statusLabel(status, locale)}
    </span>
  );
}

/**
 * Naast de status, niet in de plaats ervan: een privé-event is gewoon
 * gepubliceerd, concept of gesloten, maar staat nergens op de site. Wie de lijst
 * in het beheer overloopt, moet dat zien zonder het event te openen.
 */
export function PrivateBadge({ locale }: { locale: AdminLocale }) {
  const label = locale === "nl" ? "Privé" : "Private";
  return (
    <span
      className="ticket-admin-status"
      data-tone="neutral"
      title={
        locale === "nl"
          ? "Staat nergens op de site; enkel via de privélink te openen"
          : "Not listed anywhere on the site; only opens through the private link"
      }
    >
      <Lock aria-hidden="true" size={12} />
      {label}
    </span>
  );
}
