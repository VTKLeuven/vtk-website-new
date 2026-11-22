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
import { intervalsOverlap, registerInterval, timeInputValue, type PaymentMethod } from "@/lib/kassas/kassa";
import { KASSA_MARGIN_MINUTES } from "./match";

/**
 * `hours`: de uren van de kassa waarrond de marge ligt, om te tonen; null bij
 * de hele dag.
 */
export type ControlWindow = { start: Date; end: Date; wholeDay: boolean; hours?: { start: Date; end: Date } | null };

type Interval = { start: Date; end: Date };

const MARGIN_MS = KASSA_MARGIN_MINUTES * 60_000;

/**
 * De uren van een kassa met de marge ervoor en erna (`KASSA_MARGIN_MINUTES`).
 * Een andere kassa op hetzelfde toestel begrenst ze: ligt die er minder dan
 * twee keer de marge naast, dan delen ze het gat in het midden, zoals de
 * koppeling (`kassaAt`); overlappen ze, dan komt er aan die kant geen marge
 * bij. Zo telt een betaling nooit bij twee kassa's.
 */
export function withKassaMargin(own: Interval, others: readonly Interval[]): Interval {
  let start = own.start.getTime() - MARGIN_MS;
  let end = own.end.getTime() + MARGIN_MS;
  const ownStart = own.start.getTime();
  const ownEnd = own.end.getTime();
  for (const other of others) {
    const otherStart = other.start.getTime();
    const otherEnd = other.end.getTime();
    if (otherEnd <= ownStart) start = Math.max(start, Math.floor((otherEnd + ownStart) / 2));
    else if (otherStart >= ownEnd) end = Math.min(end, Math.floor((ownEnd + otherStart) / 2));
    else {
      if (otherStart < ownStart) start = Math.max(start, ownStart);
      if (otherEnd > ownEnd) end = Math.min(end, ownEnd);
    }
  }
  return { start: new Date(start), end: new Date(end) };
}

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
 * evenement het enige was die dag. Dus de uren van de kassa met 2 uur marge
 * ervoor en erna (`withKassaMargin`) wanneer een andere kassa dat toestel
 * dezelfde dag had, en anders de hele dag, tot het einde van de marge als de
 * kassa over middernacht loopt. Een kassa zonder uren (van voor oktober 2026)
 * telt altijd de hele dag, zonder marge.
 *
 * `others`: de uren van de andere kassa's met hetzelfde toestel, die de marge
 * begrenzen.
 */
export function kassaControlWindow(
  register: { date: Date; startsAt: Date | null; endsAt: Date | null },
  sharedThatDay: boolean,
  others: readonly Interval[] = [],
): ControlWindow {
  const hours = register.startsAt && register.endsAt ? { start: register.startsAt, end: register.endsAt } : null;
  const margin = hours ? withKassaMargin(hours, others) : null;
  if (sharedThatDay && hours && margin) return { start: margin.start, end: margin.end, wholeDay: false, hours };
  const day = registerInterval({ date: register.date, startsAt: null, endsAt: null });
  const start = margin && margin.start < day.start ? margin.start : day.start;
  const end = margin && margin.end > day.end ? margin.end : day.end;
  return { start, end, wholeDay: true, hours: null };
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
  const hours = amount.window.hours;
  if (!hours) return nl ? `van ${start} tot ${end}` : `from ${start} to ${end}`;
  // De uren van de kassa, en waarover er met de marge echt geteld werd.
  const from = timeInputValue(new Date(hours.start));
  const to = timeInputValue(new Date(hours.end));
  return nl
    ? `van ${from} tot ${to}, met marge van ${start} tot ${end}`
    : `from ${from} to ${to}, with margin from ${start} to ${end}`;
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
export type DeviceUse = {
  registerId: string;
  date: Date;
  startsAt?: Date | null;
  endsAt?: Date | null;
  method: PaymentMethod;
  terminal: string;
};

/** Een betaling of terugbetaling op een kanaal dat een toestel is. */
export type ControlTransaction = { channelId: string; occurredAt: Date; amountCents: number };

/** Hoe het toestel van een kanaal heet: "BANCONTACT|Evenementen". */
export function deviceKey(method: PaymentMethod, terminal: string): string {
  return `${method}|${terminal}`;
}

/**
 * Het venster van één toestel op één kassa. `uses` is elk toestel op elke
 * kassa van die dagen; raakt het interval van een andere kassa met hetzelfde
 * toestel het dagvenster van deze kassa (ook een kassa van de dag ervoor die na
 * middernacht doorloopt, zoals een 24-uurseetstand), dan telt de controle enkel
 * de eigen uren.
 */
export function deviceWindow(
  register: ControlRegister,
  method: PaymentMethod,
  terminal: string,
  uses: readonly DeviceUse[],
): { window: ControlWindow; sharedThatDay: boolean } {
  // De andere kassa's met dit toestel. Een kassa zonder uren heeft er geen om
  // de marge mee te begrenzen.
  const others = uses
    .filter((use) => use.registerId !== register.id && use.method === method && use.terminal === terminal)
    .map((use) => ({
      interval: registerInterval({ date: use.date, startsAt: use.startsAt ?? null, endsAt: use.endsAt ?? null }),
      hasHours: Boolean(use.startsAt && use.endsAt),
    }));
  const wholeDay = registerInterval({ date: register.date, startsAt: null, endsAt: null });
  const sharedThatDay = others.some((other) => intervalsOverlap(wholeDay, other.interval));
  const bounds = others.filter((other) => other.hasHours).map((other) => other.interval);
  return { window: kassaControlWindow(register, sharedThatDay, bounds), sharedThatDay };
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
