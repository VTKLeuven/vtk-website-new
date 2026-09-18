import Image from 'next/image';
import Link from 'next/link';
import { Card } from '@vtk/ui';
import { ArrowRight, CalendarDays, MapPin, TicketCheck } from 'lucide-react';
import {
  formatTicketMoment,
  formatTicketOrderStatus,
  formatTicketPrice,
  type PublicOrder,
} from '@/components/ticketing/public/types';

/** Dezelfde tinten als de statuspil op de bestelpagina (--ticket-* in vtk-tickets.css). */
const TONES = {
  ok: 'bg-[#e8f4ee] text-[#147a54]',
  wait: 'bg-[#fff6d9] text-[#9b6400]',
  bad: 'bg-[#fff0f2] text-[#b4233c]',
} as const;

function orderTone(status: string): keyof typeof TONES {
  if (status === 'PAID') return 'ok';
  if (status === 'REFUNDED' || status === 'CANCELLED' || status === 'EXPIRED') return 'bad';
  return 'wait';
}

/**
 * De bestellingen van dit lid, in de taal van de bestelpagina: de poster van het
 * event, de titel met wanneer en waar eronder, en rechts het bedrag met de
 * status. Haarlijnen in plaats van kaartjes; een kaart in een kaart zou dit
 * blok zwaarder maken dan de handvol regels die erin staan.
 */
export function AccountTickets({ locale, orders }: { locale: 'nl' | 'en'; orders: PublicOrder[] }) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';

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
        <ul className="mt-5 border-t border-vtk-blue/10">
          {orders.map((order) => {
            const tone = orderTone(order.status);
            const tickets = order.tickets.length;

            return (
              <li key={order.id} className="border-b border-vtk-blue/10 last:border-b-0">
                <Link
                  href={`${base}/tickets/bestelling/${order.id}`}
                  className="group -mx-2 grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl px-2 py-4 text-vtk-ink transition hover:bg-vtk-blue-soft/50 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_1rem]"
                >
                  <span
                    className="relative aspect-square w-16 overflow-hidden rounded-[14px] bg-vtk-blue-soft sm:w-[4.5rem]"
                    style={{
                      // Zonder gekoppeld kalender-event is er geen poster; dan
                      // blijft het streepjesvlak staan, net als op /tickets.
                      backgroundImage:
                        'repeating-linear-gradient(135deg, #e6ecf5 0 10px, #eff2f8 10px 20px)',
                    }}
                  >
                    {order.event.poster ? (
                      <Image
                        src={order.event.poster.src}
                        alt=""
                        fill
                        sizes="72px"
                        style={{ objectFit: 'cover', objectPosition: order.event.poster.position }}
                      />
                    ) : null}
                  </span>

                  <div className="min-w-0">
                    <h4 className="truncate font-semibold">{order.event.title}</h4>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5c667f]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} aria-hidden="true" />
                        {formatTicketMoment(order.event.startsAt, locale)}
                      </span>
                      {order.event.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <MapPin size={14} aria-hidden="true" />
                          <span className="truncate">{order.event.location}</span>
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1.5 text-xs tabular-nums text-[#5c667f]">
                      {tickets} {tickets === 1 ? 'ticket' : 'tickets'} · {order.orderNumber}
                    </p>
                  </div>

                  <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-3 sm:flex-col sm:items-end sm:gap-2">
                    <strong className="text-base tabular-nums">
                      {formatTicketPrice(order.totalCents, order.currency, locale)}
                    </strong>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-bold ${TONES[tone]}`}
                    >
                      {formatTicketOrderStatus(order.status, locale)}
                    </span>
                  </div>

                  <ArrowRight
                    size={18}
                    aria-hidden="true"
                    className="hidden text-[#5c667f] transition group-hover:translate-x-0.5 group-hover:text-vtk-ink sm:block"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 flex flex-col items-start rounded-2xl border border-dashed border-vtk-blue/20 bg-vtk-blue-soft/25 p-5">
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
