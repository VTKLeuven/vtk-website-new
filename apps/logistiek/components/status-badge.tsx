import type { UitleenReservationStatus, UitleenTransportBookingStatus } from '@prisma/client';
import { reservationStatusLabel, vanStatusLabel } from '@/lib/uitleen';
import type { LogistiekLocale } from '@/lib/i18n-shared';

const STYLES: Record<string, string> = {
  REQUESTED: 'bg-vtk-yellow/25 text-vtk-ink border-vtk-yellow-dark/40',
  APPROVED: 'bg-vtk-navy text-white border-vtk-navy',
  PICKED_UP: 'bg-vtk-paper-2 text-vtk-navy border-vtk-navy/20',
  RETURNED: 'bg-vtk-paper-2 text-vtk-muted border-vtk-navy/10',
  COMPLETED: 'bg-vtk-paper-2 text-vtk-muted border-vtk-navy/10',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-vtk-paper-2 text-vtk-muted border-vtk-navy/10',
};

export function ReservationStatusBadge({
  status,
  locale = 'nl',
}: {
  status: UitleenReservationStatus;
  locale?: LogistiekLocale;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {reservationStatusLabel(status, locale)}
    </span>
  );
}

export function VanStatusBadge({
  status,
  locale = 'nl',
}: {
  status: UitleenTransportBookingStatus;
  locale?: LogistiekLocale;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {vanStatusLabel(status, locale)}
    </span>
  );
}
