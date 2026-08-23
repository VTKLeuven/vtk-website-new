import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireManage } from '@/lib/session';
import {
  formatDateWithPart,
  formatEventMoment,
  itemLocation,
  tripHoursLabel,
} from '@/lib/uitleen';
import { adminEvent } from '@/lib/uitleen-server';
import { PrintButton } from '../../../aanvragen/print-button';

/**
 * Eén blad met alles wat er voor dit evenement moet zijn (E4).
 *
 * De bestaande klaarzetlijst is per aanvraag; die volstaat aan het rek, maar wie
 * de dag zelf vertrekt, heeft drie of vier van die blaadjes en geen overzicht.
 * Dit blad zet het logi-materiaal, het materiaal van elders, de flesserke, de
 * boodschappen en de ritten onder elkaar, met een vinkvakje per regel.
 *
 * Liggend A4: de kolommen (aantal, item, plaats, nota, vinkje) passen staand
 * niet zonder de nota af te knippen, en die nota is precies waarvoor het blad
 * bestaat.
 */
export default async function EvenementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();
  const { id } = await params;
  const event = await adminEvent(id);
  if (!event) notFound();

  // Niet toegekend materiaal (M3) gaat die dag niet mee en hoort dus niet op het
  // blad; op het scherm bij de aanvraag staat het wel, met de reden erbij.
  const materialLines = event.reservations
    .flatMap((reservation) =>
      reservation.lines
        .filter((line) => line.lineStatus !== 'REJECTED')
        .map((line) => ({
          ...line,
          requester: reservation.user.name,
          pickup: formatDateWithPart(reservation.pickupDate, reservation.pickupPart),
        }))
    )
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'nl'));

  const drinkLines = event.reservations
    .flatMap((reservation) =>
      reservation.flesserkeLines.map((line) => ({ ...line, requester: reservation.user.name }))
    )
    .sort((a, b) => a.itemName.localeCompare(b.itemName, 'nl'));

  const groceries = event.groceryOrders.flatMap((order) =>
    order.lines.map((line) => ({ ...line, reservationNumber: order.reservationNumber }))
  );

  const moment = formatEventMoment(event);
  const th = 'border-b border-vtk-navy/30 py-1.5 text-left font-semibold';
  const td = 'border-b border-vtk-navy/10 py-1.5 align-top';
  const tick = (
    <span className="inline-block h-4 w-4 border border-vtk-navy/50" aria-hidden />
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/beheer/evenementen" className="text-sm text-vtk-muted hover:underline">
          ← Terug naar de evenementen
        </Link>
        <PrintButton />
      </div>

      <article className="print-sheet print-landscape mx-auto w-full max-w-[1100px] rounded-[18px] border border-vtk-navy/15 bg-white p-8 text-vtk-ink print:max-w-none print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-vtk-navy/20 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-vtk-muted">
              VTK Logistiek · materiaallijst
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{event.name}</h1>
          </div>
          <dl className="grid gap-0.5 text-right text-sm">
            <div>
              <dt className="inline text-vtk-muted">Wanneer: </dt>
              <dd className="inline font-medium">{moment ?? 'niet ingevuld'}</dd>
            </div>
            <div>
              <dt className="inline text-vtk-muted">Locatie: </dt>
              <dd className="inline font-medium">{event.location || 'niet ingevuld'}</dd>
            </div>
            {event.expectedAttendance !== null ? (
              <div>
                <dt className="inline text-vtk-muted">Verwacht: </dt>
                <dd className="inline font-medium">{event.expectedAttendance} personen</dd>
              </div>
            ) : null}
          </dl>
        </header>

        {event.note ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold">Nota van Logistiek:</span> {event.note}
          </p>
        ) : null}

        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Materiaal van Logistiek</h2>
          {materialLines.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">Niets aangevraagd.</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-10`}>✓</th>
                  <th className={`${th} w-14 text-right`}>Aantal</th>
                  <th className={`${th} pl-4`}>Item</th>
                  <th className={`${th} w-28`}>Plaats</th>
                  <th className={`${th} w-40`}>Afhalen</th>
                  <th className={`${th} w-64`}>Nota</th>
                </tr>
              </thead>
              <tbody>
                {materialLines.map((line) => (
                  <tr key={line.id}>
                    <td className={td}>{tick}</td>
                    <td className={`${td} text-right tabular-nums`}>{line.quantity}×</td>
                    <td className={`${td} pl-4`}>
                      {line.itemName}
                      <span className="block text-xs text-vtk-muted">{line.requester}</span>
                    </td>
                    <td className={`${td} tabular-nums`}>{itemLocation(line.item) ?? '—'}</td>
                    <td className={td}>{line.pickup}</td>
                    <td className={`${td} text-xs`}>
                      {line.note ? <span className="block italic">{line.note}</span> : null}
                      {line.adminNote ? (
                        <span className="block italic">Logi: {line.adminNote}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {event.extraItems.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Materiaal van elders</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-10`}>✓</th>
                  <th className={`${th} w-14 text-right`}>Aantal</th>
                  <th className={`${th} pl-4`}>Item</th>
                  <th className={`${th} w-40`}>Van wie</th>
                  <th className={`${th} w-64`}>Nota</th>
                </tr>
              </thead>
              <tbody>
                {event.extraItems.map((item) => (
                  <tr key={item.id}>
                    <td className={td}>{tick}</td>
                    <td className={`${td} text-right tabular-nums`}>{item.quantity}×</td>
                    <td className={`${td} pl-4`}>{item.itemName}</td>
                    <td className={td}>{item.source}</td>
                    <td className={`${td} text-xs italic`}>{item.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {drinkLines.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Flesserke</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-10`}>✓</th>
                  <th className={`${th} w-14 text-right`}>Aantal</th>
                  <th className={`${th} pl-4`}>Item</th>
                  <th className={`${th} w-40`}>Aangevraagd door</th>
                </tr>
              </thead>
              <tbody>
                {drinkLines.map((line) => (
                  <tr key={line.id}>
                    <td className={td}>{tick}</td>
                    <td className={`${td} text-right tabular-nums`}>{line.quantity}×</td>
                    <td className={`${td} pl-4`}>{line.itemName}</td>
                    <td className={td}>{line.requester}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {groceries.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Collect&amp;Go
              <span className="ml-2 font-normal normal-case text-vtk-muted">
                {event.groceryOrders.map((order) => order.reservationNumber).join(', ')}
              </span>
            </h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-10`}>✓</th>
                  <th className={`${th} w-20 text-right`}>Aantal</th>
                  <th className={`${th} pl-4`}>Product</th>
                </tr>
              </thead>
              <tbody>
                {groceries.map((line, index) => (
                  <tr key={`${line.productName}-${index}`}>
                    <td className={td}>{tick}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      {line.quantityText || `${line.quantity}${line.unit ? ` ${line.unit}` : ''}`}
                    </td>
                    <td className={`${td} pl-4`}>{line.productName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {event.transport.length > 0 ? (
          <section className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Ritten</h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${th} w-40`}>Wanneer</th>
                  <th className={`${th} w-32`}>Voertuig</th>
                  <th className={`${th} w-40`}>Chauffeur</th>
                  <th className={`${th} pl-4`}>Waarvoor</th>
                </tr>
              </thead>
              <tbody>
                {event.transport.map((booking) => (
                  <tr key={booking.id}>
                    <td className={td}>{tripHoursLabel(booking.startAt, booking.endAt)}</td>
                    <td className={td}>{booking.vehicle.nameNl}</td>
                    <td className={td}>{booking.driver?.name ?? 'nog geen'}</td>
                    <td className={`${td} pl-4`}>{booking.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </article>
    </div>
  );
}
