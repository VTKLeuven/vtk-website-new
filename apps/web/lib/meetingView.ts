/**
 * Bouwt de kaart die iemand op de grocomeet- of bureaupagina ziet: het aanbod
 * van dat moment, de eigen bestelling en het bestelvenster in leesbare taal.
 * Server-only; de kaart zelf is een clientcomponent
 * (`components/meetings/MeetingReservationCard`).
 */

import "server-only";

import type { Meeting, MeetingOption, MeetingReservation } from "@prisma/client";
import { pick, type Locale } from "@vtk/i18n";

import type { MeetingCardView } from "@/components/meetings/MeetingReservationCard";
import { meetingCloseAt, meetingWindowState, offeringNameKey, type MeetingDrinks } from "./meetings";
import { offeringForMeeting, sessionForMeeting } from "./meetings-server";

type MeetingWithOptions = Meeting & { options: MeetingOption[] };

export async function buildMeetingCard(
  meeting: MeetingWithOptions,
  reservation: MeetingReservation | null,
  options: { locale: Locale; drinks: MeetingDrinks; now?: Date },
): Promise<MeetingCardView> {
  const { locale, drinks } = options;
  const now = options.now ?? new Date();
  const nl = locale === "nl";

  const session = meeting.useTheokot ? await sessionForMeeting(meeting) : null;
  const offering = await offeringForMeeting(meeting, session);
  const closeAt = meetingCloseAt(meeting, session);

  const dateTime = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const choiceKey = reservation?.optionId ?? (reservation?.itemNameNl ? offeringNameKey(reservation.itemNameNl) : null);

  return {
    id: meeting.id,
    dateLabel: dateTime.format(meeting.startsAt),
    locationLabel: meeting.location,
    note: pick(meeting.noteNl ?? "", meeting.noteEn ?? "", locale) || null,
    state: meetingWindowState(meeting, session, now),
    opensLabel: meeting.opensAt ? dateTime.format(meeting.opensAt) : null,
    closeLabel: dateTime.format(closeAt),
    choices: offering.map((choice) => ({
      key: choice.key,
      label: pick(choice.nameNl, choice.nameEn, locale) ?? choice.nameNl,
      priceCents: choice.priceCents,
      remaining: choice.remaining,
    })),
    drinks,
    askComment: meeting.kind === "BUREAU",
    // Zonder verkoopdag komt het aanbod uit de catalogus; wat er die week echt
    // ligt, beslist Theokot pas bij het aanmaken van de week.
    offeringProvisional: meeting.useTheokot && session === null,
    reservation: reservation
      ? {
          choiceKey: reservation.status === "INVALIDATED" ? null : choiceKey,
          choiceLabel: reservation.itemNameNl
            ? pick(reservation.itemNameNl, reservation.itemNameEn, locale) ?? reservation.itemNameNl
            : null,
          drink: reservation.drinkName,
          comment: reservation.comment,
          totalCents: reservation.itemPriceCents + reservation.drinkPriceCents,
          invalidReason: reservation.status === "INVALIDATED" ? reservation.invalidatedReason : null,
        }
      : null,
  };
}
