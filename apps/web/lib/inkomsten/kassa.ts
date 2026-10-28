/**
 * De kassacontrole: wat de online inkomsten op een toestel zagen tijdens een
 * kassa, naast het bedrag dat Beheer van dat toestel afleest. Puur en zonder
 * database, zodat het telformulier ermee rekent terwijl je typt, en zodat het
 * te testen is. De queries staan in `server.ts` (`kassaImportAmounts` voor één
 * kassa, `kassaControlList` voor de lijst met afwijkingen); beide rekenen hier.
 *
 * De import schrijft nooit in een kassa: het ingetikte bedrag is wat Beheer
 * afleest, en een verschil is een waarschuwing. Zie docs/inkomsten.md.
 */
import { registerInterval, timeInputValue, type PaymentMethod } from "@/lib/kassas/kassa";

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

/**
 * Waarover de controle telde, voor in een zin: "de hele dag" of "van 20:00 tot
 * 23:00". Een datum kan als tekst binnenkomen wanneer ze van de server naar de
 * browser reist.
 */
export function controlSpanLabel(amount: Pick<KassaImportAmount, "window" | "sharedThatDay">, nl: boolean): string {
  if (amount.window.wholeDay) {
    const day = nl ? "de hele dag" : "the whole day";
    if (!amount.sharedThatDay) return day;
    return day + (nl ? ", ook die van een andere kassa" : ", including another register");
  }
  const start = timeInputValue(new Date(amount.window.start));
  const end = timeInputValue(new Date(amount.window.end));
  return nl ? `van ${start} tot ${end}` : `from ${start} to ${end}`;
}

/** "1 betaling", "3 betalingen". */
export function paymentsLabel(count: number, nl: boolean): string {
  return nl ? `${count} ${count === 1 ? "betaling" : "betalingen"}` : `${count} ${count === 1 ? "payment" : "payments"}`;
}

/** Het ingetikte bedrag (`null` = leeg) naast wat de import zag. */
export function kassaCheck(typedCents: number | null, amount: Pick<KassaImportAmount, "cents" | "count">): KassaCheck {
  if (amount.count === 0) return { state: "nothing" };
  if (typedCents === null) return { state: "empty", importCents: amount.cents };
  if (typedCents === amount.cents) return { state: "match", importCents: amount.cents };
  return { state: "differs", importCents: amount.cents, typedCents, differenceCents: typedCents - amount.cents };
}

/** Wat de controle van een kassa nodig heeft: haar dag en haar uren. */
export type ControlRegister = { id: string; date: Date; startsAt: Date | null; endsAt: Date | null };

/** Een toestel op een kassa, zoals `CashRegisterPayment` het bewaart. */
export type DeviceUse = { registerId: string; date: Date; method: PaymentMethod; terminal: string };

/** Een betaling of terugbetaling op een kanaal dat een toestel is. */
export type ControlTransaction = { channelId: string; occurredAt: Date; amountCents: number };

/** Hoe het toestel van een kanaal heet: "BANCONTACT|Evenementen". */
export function deviceKey(method: PaymentMethod, terminal: string): string {
  return `${method}|${terminal}`;
}

/**
 * Het venster van één toestel op één kassa. `uses` is elk toestel op elke
 * kassa van die dag; had een andere kassa hetzelfde toestel, dan telt de
 * controle enkel de uren.
 */
export function deviceWindow(
  register: ControlRegister,
  method: PaymentMethod,
  terminal: string,
  uses: readonly DeviceUse[],
): { window: ControlWindow; sharedThatDay: boolean } {
  const sharedThatDay = uses.some(
    (use) =>
      use.registerId !== register.id &&
      use.date.getTime() === register.date.getTime() &&
      use.method === method &&
      use.terminal === terminal,
  );
  return { window: kassaControlWindow(register, sharedThatDay), sharedThatDay };
}

/**
 * Wat de import op een toestel zag: de betalingen min de terugbetalingen op
 * zijn kanalen, van het begin van het venster tot (zonder) het einde. Ook wat
 * "telt niet mee" kreeg, telt: dit is wat er op het toestel binnenkwam.
 */
export function importAmountOf(
  method: PaymentMethod,
  terminal: string,
  placed: { window: ControlWindow; sharedThatDay: boolean },
  channelIds: readonly string[],
  transactions: readonly ControlTransaction[],
): KassaImportAmount {
  const channels = new Set(channelIds);
  let cents = 0;
  let count = 0;
  for (const tx of transactions) {
    if (!channels.has(tx.channelId) || tx.occurredAt < placed.window.start || tx.occurredAt >= placed.window.end) continue;
    cents += tx.amountCents;
    count += 1;
  }
  return { method, terminal, cents, count, window: placed.window, sharedThatDay: placed.sharedThatDay };
}

/**
 * De stand van een toestel in de lijst met afwijkingen: die van `kassaCheck`,
 * of `unlinked` wanneer nog geen kanaal van de online inkomsten dat toestel is.
 */
export type KassaControlState = KassaCheck["state"] | "unlinked";

export function kassaControlState(typedCents: number | null, amount: KassaImportAmount | null): KassaControlState {
  return amount ? kassaCheck(typedCents, amount).state : "unlinked";
}
