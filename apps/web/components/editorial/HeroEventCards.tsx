import Image from "next/image";
import Link from "@/components/ui/Link";
import { HOME_LINK_EVENT, umamiEvent } from "@/lib/analytics";

export type HeroEventCard = {
  id: string;
  href: string;
  title: string;
  photo: string;
  /** De gekozen uitsnede; leeg bij een standaardfoto, die gecentreerd blijft. */
  photoPosition?: string;
  when: string;
  location: string | null;
  pin: { weekday: string; day: string; month: string };
};

export type HeroEvents = {
  heading: string;
  link: { label: string; href: string };
  cards: HeroEventCard[];
};

/**
 * De evenementen in de hero: losse affiches die over de gele streep hangen, met
 * titel en uur zonder kaart op de lichte band eronder. Er staat bewust geen witte
 * kaart rond: op navy tekende die een rand rond elke foto.
 *
 * Geen ster en geen "Zet in mijn agenda": die horen bij de volle kaart in de band
 * Aankomende evenementen. Hier is de hele tegel één link.
 */
export function HeroEventCards({ cards }: { cards: HeroEventCard[] }) {
  return (
    <div className="g-events">
      <div className="g-events-row">
        {cards.map((card, index) => (
          <Link
            key={card.id}
            href={card.href}
            className="g-event"
            style={{ animationDelay: `${(1.2 + index * 0.08).toFixed(2)}s` }}
            {...umamiEvent(HOME_LINK_EVENT, { soort: "hero-evenement", naar: card.href })}
          >
            <span className="g-event-shot">
              <Image
                src={card.photo}
                alt=""
                fill
                // De kolom is hoogstens 277 px breed, en vaste 265 px in de
                // schuifrij op een smal scherm.
                sizes="(max-width: 900px) 265px, 290px"
                // Deze foto's staan bij het laden in beeld, dus niet lui laden.
                loading="eager"
                style={card.photoPosition ? { objectPosition: card.photoPosition } : undefined}
              />
              {/* Dezelfde datumpin als op de evenementkaart. */}
              <span className="ev-card-pin">
                <i>{card.pin.weekday}</i>
                <b>{card.pin.day}</b>
                <i>{card.pin.month}</i>
              </span>
            </span>
            <span className="g-event-text">
              <span className="g-event-title">{card.title}</span>
              <span className="g-event-meta">
                {card.when}
                {card.location ? (
                  <>
                    <br />
                    {card.location}
                  </>
                ) : null}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
