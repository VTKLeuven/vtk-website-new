import Link from 'next/link';
import { Card } from '@vtk/ui';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, MapPin, TicketCheck } from 'lucide-react';
import {
  formatTicketDate,
  formatTicketOrderStatus,
  formatTicketPrice,
  type PublicOrder,
} from '@/components/ticketing/public/types';

function OrderState({ status, locale }: { status: string; locale: 'nl' | 'en' }) {
  const ready = status === 'PAID' || status === 'PARTIALLY_REFUNDED';

  return (
    <span
      className={`inline-flex items-center gap-1 text-[0.7rem] font-bold uppercase ${
        ready ? 'text-emerald-700' : 'text-[#5c667f]'
      }`}
    >
      {ready ? <CheckCircle2 size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
      {formatTicketOrderStatus(status, locale)}
    </span>
  );
}

export function AccountTickets({ locale, orders }: { locale: 'nl' | 'en'; orders: PublicOrder[] }) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const monthFormatter = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-BE', {
    month: 'short',
  });

  return (
    <Card id="mijn-vtk-tickets" className="scroll-mt-28 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-vtk-ink">{nl ? 'Mijn tickets' : 'My tickets'}</h3>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl ? 'Al je betaalde VTK-tickets op één plek.' : 'All your paid VTK tickets in one place.'}
          </p>
        </div>
        <Link
          href={`${base}/tickets`}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-vtk-ink px-4 text-sm font-medium text-vtk-ink transition hover:bg-vtk-blue-soft"
        >
          {nl ? 'Meer tickets' : 'Find tickets'}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      {orders.length > 0 ? (
        <ul className="mt-5 space-y-3">
          {orders.map((order) => {
            const startsAt = new Date(order.event.startsAt);

            return (
              <li key={order.id}>
                <Link
                  href={`${base}/tickets/bestelling/${order.id}`}
                  className="group grid grid-cols-[3.5rem_minmax(0,1fr)_1rem] items-center gap-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/25 p-3 text-vtk-ink transition hover:border-vtk-blue/25 hover:bg-vtk-blue-soft/50 sm:grid-cols-[4rem_minmax(0,1fr)_auto_1rem] sm:gap-4 sm:p-4"
                >
                  <div
                    className="flex h-16 w-14 flex-col items-center justify-center rounded-xl bg-vtk-navy text-white sm:h-[4.5rem] sm:w-16"
                    aria-hidden="true"
                  >
                    <strong className="text-2xl leading-none">{startsAt.getDate()}</strong>
                    <span className="mt-1 text-[0.65rem] font-bold uppercase text-vtk-yellow">
                      {monthFormatter.format(startsAt).replace('.', '')}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <OrderState status={order.status} locale={locale} />
                      <span className="font-mono text-[0.65rem] text-[#5c667f]">{order.orderNumber}</span>
                    </div>
                    <h4 className="mt-1 truncate font-semibold">{order.event.title}</h4>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[#5c667f]">
                      <CalendarDays size={14} aria-hidden="true" />
                      {formatTicketDate(order.event.startsAt, locale)}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-[#5c667f]">
                      <MapPin size={14} aria-hidden="true" />
                      {order.event.location ?? '–'}
                    </p>
                  </div>

                  <div className="col-start-2 flex flex-wrap items-center justify-between gap-2 text-sm sm:col-start-auto sm:block sm:text-right">
                    <span className="text-xs text-[#5c667f]">
                      {order.tickets.length} {order.tickets.length === 1 ? 'ticket' : 'tickets'}
                    </span>
                    <strong className="block sm:mt-1">
                      {formatTicketPrice(order.totalCents, order.currency, locale)}
                    </strong>
                  </div>

                  <ArrowRight
                    size={18}
                    aria-hidden="true"
                    className="text-[#5c667f] transition group-hover:translate-x-0.5 group-hover:text-vtk-ink"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 flex flex-col items-start rounded-xl border border-dashed border-vtk-blue/20 bg-vtk-blue-soft/25 p-5">
          <TicketCheck size={24} aria-hidden="true" className="text-[#5c667f]" />
          <h4 className="mt-3 font-semibold text-vtk-ink">{nl ? 'Nog geen tickets' : 'No tickets yet'}</h4>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? 'Je betaalde bestellingen verschijnen automatisch hier.'
              : 'Your paid orders will automatically appear here.'}
          </p>
        </div>
      )}
    </Card>
  );
}
