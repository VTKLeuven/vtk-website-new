'use client';

import Link from 'next/link';
import type { UitleenTransportBookingStatus } from '@prisma/client';
import { PhoneLink } from '@/components/phone-link';
import { VanStatusBadge } from '@/components/status-badge';
import { TripHelpers } from '@/components/trip-helpers';
import { ToastProvider } from '@/components/ui/toast';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * Alles wat Logistiek over één rit te zien krijgt op het bezettingsoverzicht
 * (/vervoer/bezetting), in het kaartje naast het blok.
 *
 * Waarom dit hier bestaat naast het paneel van de teamplanning: dat paneel is
 * een werkblad (beslissen, schuiven, chauffeur kiezen, verwijderen) en dit is
 * een **leeskaart**. Wie op het bezettingsoverzicht een rit aanklikt, wil weten
 * welke post ze aanvroeg, waarvoor ze dient en wie rijdt; hij is niet aan het
 * plannen. Dezelfde knoppen hier nog eens zetten zou van deze pagina een tweede
 * planning maken, en dan zijn er twee schermen die hetzelfde half doen.
 *
 * Het kaartje is voor het **praesidium, werkgroepen, jaarwerkingen, Logistiek en IT**, en voor wie met
 * `logistiek.helpers` de bijrijders regelt (`canSeeTripDetails`).
 * Het is dus ledenoppervlak en geen beheerscherm, en het volgt daarom de taal
 * van de bezoeker zoals de rest van de ledenkant. Wat een post niet hoort te
 * zien, komt niet als lege regel maar helemaal niet mee uit de server (zie
 * `transportWeekForPraesidium`); dit kaartje laat gewoon elk veld weg dat leeg
 * is.
 *
 * De uren en de dag komen als tekst van de server: ze formatteren in de
 * Belgische tijdzone hoort niet twee keer geschreven te staan, en een `Date` die
 * de client-grens over gaat, is hier toch al een string.
 */
export type BezettingTrip = {
  id: string;
  /**
   * Het evenement, of het doel wanneer er geen evenement aan hangt. Hetzelfde
   * als in het blok, en daarom staat het evenement niet nog eens in het raster
   * eronder: dat zou de titel letterlijk herhalen.
   */
  title: string;
  /** De post of werkgroep die de rit aanvroeg; bij een externe zijn naam. */
  requester: string;
  /** Het lid dat het formulier indiende, of wie de rit intekende. */
  userName: string;
  status: UitleenTransportBookingStatus;
  vehicleName: string;
  /** Dag plus tijdvenster, al in Belgische tijd gezet. */
  whenLabel: string;
  /** Heen- of terugrit van een paar; null bij een gewone enkele rit. */
  legLabel: string | null;
  purpose: string;
  driverName: string | null;
  /** Rijdt Logistiek dit voertuig? Zo niet is "geen chauffeur" geen openstaand werk. */
  needsDriver: boolean;
  cargoNote: string | null;
  pickupAddress: string | null;
  destination: string | null;
  helpers: Array<{ id: string; name: string; phone: string | null }>;
  helpersNote: string | null;
  /**
   * Mag deze persoon de bijrijders nog bijwerken? (V2) De aanvrager en zijn post
   * kunnen dat hier zelf, zonder langs Logistiek te moeten; de server toetst het
   * nog eens (`canEditHelpers` in app/actions/uitleen.ts).
   */
  canEditHelpers: boolean;
  helpersPhone: string | null;
  contactPhone: string | null;
  memberNote: string | null;
  adminNote: string | null;
  /** De materiaalaanvraag waarvan dit de levering is. */
  reservationId: string | null;
};

export function TripCard({
  trip,
  locale,
  /** Enkel Logistiek en IT krijgen de link naar het beheer; zie `PublicWeek`. */
  manage,
}: {
  trip: BezettingTrip;
  locale: LogistiekLocale;
  manage: boolean;
}) {
  const en = locale === 'en';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <VanStatusBadge status={trip.status} locale={locale} />
        <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
          {trip.vehicleName}
        </span>
        {trip.legLabel ? <span className="text-xs text-vtk-muted">{trip.legLabel}</span> : null}
      </div>

      <dl className="logistics-fact-grid">
        <div data-span="2">
          <dt>{en ? 'When' : 'Wanneer'}</dt>
          <dd>{trip.whenLabel}</dd>
        </div>
        <div>
          <dt>{en ? 'Driver' : 'Chauffeur'}</dt>
          <dd>
            {trip.driverName ? (
              trip.driverName
            ) : trip.needsDriver ? (
              <span className="text-vtk-danger">
                {en ? 'not assigned yet' : 'nog niet toegewezen'}
              </span>
            ) : (
              // Bij de bakfiets rijdt de aanvrager zelf: dat is de normale gang
              // van zaken en geen ontbrekende chauffeur (T13).
              (en ? 'the requester drives' : 'de aanvrager rijdt zelf')
            )}
          </dd>
        </div>
        <div>
          <dt>{en ? 'Requested by' : 'Aangevraagd door'}</dt>
          <dd>{trip.userName}</dd>
        </div>
        <div data-span="2">
          <dt>{en ? 'What for' : 'Waarvoor'}</dt>
          <dd>{trip.purpose}</dd>
        </div>
        {trip.cargoNote ? (
          <div data-span="2">
            <dt>{en ? 'Cargo' : 'Wat er mee moet'}</dt>
            <dd>{trip.cargoNote}</dd>
          </div>
        ) : null}
        {trip.pickupAddress ? (
          <div data-span="2">
            <dt>{en ? 'Pick-up' : 'Ophalen'}</dt>
            <dd>{trip.pickupAddress}</dd>
          </div>
        ) : null}
        {trip.destination ? (
          <div data-span="2">
            <dt>{en ? 'Destination' : 'Bestemming'}</dt>
            <dd>{trip.destination}</dd>
          </div>
        ) : null}
        {trip.contactPhone ? (
          <div>
            <dt>{en ? 'Call the requester' : 'Aanvrager bellen'}</dt>
            <dd>
              <PhoneLink number={trip.contactPhone} />
            </dd>
          </div>
        ) : null}
        {trip.helpersPhone ? (
          <div>
            <dt>{en ? 'Call the helper' : 'Bijrijder bellen'}</dt>
            <dd>
              <PhoneLink number={trip.helpersPhone} />
            </dd>
          </div>
        ) : null}
        {trip.memberNote ? (
          <div data-span="2">
            <dt>{en ? 'Note from the member' : 'Nota van het lid'}</dt>
            <dd>{trip.memberNote}</dd>
          </div>
        ) : null}
        {trip.adminNote ? (
          <div data-span="2">
            <dt>{en ? 'Note from the team' : 'Nota van het team'}</dt>
            <dd>{trip.adminNote}</dd>
          </div>
        ) : null}
        {manage && trip.reservationId ? (
          <div data-span="2">
            <dt>{en ? 'Delivery for' : 'Levering voor'}</dt>
            <dd>
              <Link
                href={`/beheer/aanvragen/${trip.reservationId}`}
                className="underline underline-offset-2"
              >
                {en ? 'the equipment request' : 'de materiaalaanvraag'}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>

      {/* De bijrijders staan onder het raster en niet erin: het is het enige
          blok waar je iets kan wijzigen, en een veld met een knop erin tussen
          twee feiten leest als een feit. Ook zonder wijzigrecht staat het hier,
          want dan is het gewoon de lijst. */}
      {trip.canEditHelpers || trip.helpers.length > 0 || trip.helpersNote ? (
        <div className="border-t border-vtk-navy/10 pt-4">
          <ToastProvider>
            <TripHelpers
              bookingId={trip.id}
              helpers={trip.helpers}
              legacyNote={trip.helpersNote}
              canEdit={trip.canEditHelpers}
              locale={locale}
            />
          </ToastProvider>
        </div>
      ) : null}
    </div>
  );
}
