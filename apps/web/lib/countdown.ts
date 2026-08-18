/**
 * Aftellen in dagen, uren en minuten.
 *
 * Geen seconden: de frontpage is server-gerenderd en de klok tikt clientside
 * bij; op minuten volstaat een trage timer, terwijl seconden elke seconde een
 * re-render van de hero vragen voor een cijfer waar niemand naar kijkt.
 *
 * Staat los van de client-component zodat de server dezelfde eerste waarde kan
 * berekenen: elke export van een `"use client"`-module is een client-referentie
 * en valt vanuit een server component niet aan te roepen.
 */

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  /** Het moment ligt achter ons; de teller toont dan nullen. */
  passed: boolean;
};

export function countdownParts(target: Date, now: Date): CountdownParts {
  const ms = target.getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, passed: true };
  }
  const totalMinutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    passed: false,
  };
}
