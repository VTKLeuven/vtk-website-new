/**
 * De kassacontrole: wat de online inkomsten op een toestel zagen tijdens een
 * kassa, naast het bedrag dat Beheer van dat toestel afleest. Puur en zonder
 * database, zodat het telformulier ermee rekent terwijl je typt, en zodat het
 * te testen is. Het optellen zelf staat in `server.ts` (`kassaImportAmounts`).
 *
 * De import schrijft nooit in een kassa: het ingetikte bedrag is wat Beheer
 * afleest, en een verschil is een waarschuwing. Zie docs/inkomsten.md.
 */
import { registerInterval, type PaymentMethod } from "@/lib/kassas/kassa";

export type ControlWindow = { start: Date; end: Date; wholeDay: boolean };

/** Wat de import op één toestel zag binnen het venster van een kassa. */
export type KassaImportAmount = {
  method: PaymentMethod;
  terminal: string;
  /** Betalingen min terugbetalingen, in centen. */
  cents: number;
  count: number;
  window: ControlWindow;
  /** Een andere kassa had dit toestel dezelfde dag. */
  sharedThatDay: boolean;
};

/**
 * Over welke tijd de controle een toestel van een kassa optelt. Beheer leest
 * het toestel af voor en na een evenement, of neemt het dagtotaal wanneer dat
 * evenement het enige was die dag. Dus de uren van de kassa wanneer een andere
 * kassa dat toestel dezelfde dag had, en anders de hele dag, tot het einde van
 * de kassa als die over middernacht loopt. Een kassa zonder uren (van voor
 * oktober 2026) telt altijd de hele dag.
 */
export function kassaControlWindow(
  register: { date: Date; startsAt: Date | null; endsAt: Date | null },
  sharedThatDay: boolean,
): ControlWindow {
  if (sharedThatDay && register.startsAt && register.endsAt) {
    return { start: register.startsAt, end: register.endsAt, wholeDay: false };
  }
  const day = registerInterval({ date: register.date, startsAt: null, endsAt: null });
  const end = register.endsAt && register.endsAt > day.end ? register.endsAt : day.end;
  return { start: day.start, end, wholeDay: true };
}

export type KassaCheck =
  /** De import zag niets: wellicht is de export van die dag nog niet opgeladen. */
  | { state: "nothing" }
  /** Nog niets afgelezen: Beheer kan het bedrag van de import overnemen. */
  | { state: "empty"; importCents: number }
  | { state: "match"; importCents: number }
  | { state: "differs"; importCents: number; typedCents: number; differenceCents: number };

/** Het ingetikte bedrag (`null` = leeg) naast wat de import zag. */
export function kassaCheck(typedCents: number | null, amount: Pick<KassaImportAmount, "cents" | "count">): KassaCheck {
  if (amount.count === 0) return { state: "nothing" };
  if (typedCents === null) return { state: "empty", importCents: amount.cents };
  if (typedCents === amount.cents) return { state: "match", importCents: amount.cents };
  return { state: "differs", importCents: amount.cents, typedCents, differenceCents: typedCents - amount.cents };
}
