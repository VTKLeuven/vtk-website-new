import { describe, expect, it } from "vitest";
import {
  toPublicRentalSlots,
  type PublicRentalRow,
} from "@/components/theokot/publicRentalSlots";
import {
  PUBLIC_BUSY_STATUSES,
  RENTAL_STATUSES,
  isPubliclyBusy,
  rentalGridSlot,
} from "@/lib/theokotVerhuur";

/**
 * De publieke beschikbaarheidskalender.
 *
 * De belangrijkste test hier is de laatste: hij controleert niet wat er in een
 * publiek blokje staat, maar dat er niets méér in staat. Wie er later een veld
 * bij zet, ziet hem falen; zonder die test belandt een naam of een telefoonnummer
 * in de HTML van een pagina zonder login, en dat valt in een review niet op.
 */

function row(overrides: Partial<PublicRentalRow> = {}): PublicRentalRow {
  return {
    id: "rental-1",
    // 20:00 Brussel (zomertijd), 3 oktober 2026
    startsAt: new Date("2026-10-03T18:00:00.000Z"),
    // 02:00 Brussel, de volgende ochtend
    endsAt: new Date("2026-10-04T00:00:00.000Z"),
    purpose: "[Theokot] Kaas- en wijnavond",
    purposePublic: false,
    ...overrides,
  };
}

const fmt = {
  time: (date: Date) =>
    new Intl.DateTimeFormat("nl-BE", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date),
  day: (date: Date) =>
    new Intl.DateTimeFormat("nl-BE", {
      timeZone: "Europe/Brussels",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date),
};

describe("isPubliclyBusy", () => {
  it("houdt enkel goedgekeurd, afgelopen en afgerond de zaal publiek bezet", () => {
    const busy = RENTAL_STATUSES.filter(isPubliclyBusy);
    expect(busy).toEqual([...PUBLIC_BUSY_STATUSES]);
  });

  it("laat een onbeantwoorde aanvraag een avond niet wegnemen", () => {
    // Intern telt ze wel mee (blocksRoom), publiek niet: anders blokkeert een
    // aanvraag die nog geweigerd kan worden een avond die niemand heeft.
    expect(isPubliclyBusy("UNANSWERED")).toBe(false);
    expect(isPubliclyBusy("REJECTED")).toBe(false);
    expect(isPubliclyBusy("CANCELLED")).toBe(false);
  });
});

describe("rentalGridSlot", () => {
  it("zet een avond die na middernacht eindigt op de startdag met minuten boven 1440", () => {
    const slot = rentalGridSlot(
      new Date("2026-10-03T18:00:00.000Z"),
      new Date("2026-10-04T00:00:00.000Z"),
    );
    expect(slot.day).toBe("2026-10-03");
    expect(slot.minutes).toBe(20 * 60);
    expect(slot.endMinutes).toBe(26 * 60);
  });

  it("houdt een gewone namiddag op dezelfde dag", () => {
    const slot = rentalGridSlot(
      new Date("2026-10-03T12:00:00.000Z"),
      new Date("2026-10-03T16:00:00.000Z"),
    );
    expect(slot.day).toBe("2026-10-03");
    expect(slot.minutes).toBe(14 * 60);
    expect(slot.endMinutes).toBe(18 * 60);
  });

  it("rekent in wandklok, ook in het winteruur", () => {
    // 20:00 Brussel in november is 19:00 UTC; een naïeve omzetting zou hier 19 uur
    // van maken en de verhuur een uur te vroeg tekenen.
    const slot = rentalGridSlot(
      new Date("2026-11-13T19:00:00.000Z"),
      new Date("2026-11-13T23:00:00.000Z"),
    );
    expect(slot.day).toBe("2026-11-13");
    expect(slot.minutes).toBe(20 * 60);
    expect(slot.endMinutes).toBe(24 * 60);
  });
});

describe("toPublicRentalSlots", () => {
  it("laat de aard van de activiteit weg zolang ze niet vrijgegeven is", () => {
    const [slot] = toPublicRentalSlots([row()], fmt);
    expect(slot!.title).toBeNull();
    expect(slot!.timeLabel).toBe("20:00 – 02:00");
    expect(slot!.dayLabel).toBe("zaterdag 3 oktober");
  });

  it("toont ze wel wanneer het vinkje in het beheer aan staat", () => {
    const [slot] = toPublicRentalSlots([row({ purposePublic: true })], fmt);
    expect(slot!.title).toBe("[Theokot] Kaas- en wijnavond");
  });

  it("geeft niets anders mee dan wat de kalender tekent", () => {
    const [slot] = toPublicRentalSlots([row({ purposePublic: true })], fmt);
    expect(Object.keys(slot!).sort()).toEqual([
      "day",
      "dayLabel",
      "endMinutes",
      "id",
      "minutes",
      "timeLabel",
      "title",
    ]);
  });
});
