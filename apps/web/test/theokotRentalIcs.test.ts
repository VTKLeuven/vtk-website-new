import { describe, expect, it } from "vitest";
import {
  serializeRentalCalendar,
  type RentalIcsRow,
} from "@/lib/theokotVerhuurIcs";

const NOW = new Date("2026-09-04T12:00:00.000Z");

function sampleRental(overrides: Partial<RentalIcsRow> = {}): RentalIcsRow {
  return {
    id: "rent123",
    responsibleName: "Sarah De Smet",
    phone: "0470 99 88 77",
    email: "sarah@voorbeeld.be",
    startsAt: new Date("2026-10-15T18:00:00.000Z"),
    endsAt: new Date("2026-10-16T01:00:00.000Z"),
    purpose: "Doopcantus Theokot",
    attendees: 80,
    remarks: "We brengen eigen tapinstallatie mee.",
    depositChoice: "TRANSFER",
    deposit: "TRANSFER_IN",
    contract: "SIGNED",
    keyStatus: "PENDING",
    status: "APPROVED",
    internalNote: "Akkoord met verlengd einduur",
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
    ...overrides,
  };
}

function unfold(ics: string): string {
  const out: string[] = [];
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ") && out.length > 0) out[out.length - 1] += line.slice(1);
    else if (line !== "") out.push(line);
  }
  return out.join("\n");
}

describe("Theokot verhuur iCalendar export", () => {
  it("genereert een geldige VCALENDAR met correcte metadata", () => {
    const ics = serializeRentalCalendar([], { locale: "nl", now: NOW });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//VTK//Website//NL");
    expect(ics).toContain("NAME:Theokot Verhuur");
    expect(ics).toContain("X-WR-CALNAME:Theokot Verhuur");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(ics).toContain("X-PUBLISHED-TTL:PT1H");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("geeft goedgekeurde verhuren de [Goedgekeurd] prefix in het Nederlands", () => {
    const rental = sampleRental({ status: "APPROVED" });
    const ics = serializeRentalCalendar([rental], { locale: "nl", now: NOW });

    expect(ics).toContain("SUMMARY:[Goedgekeurd] Sarah De Smet – Doopcantus Theokot");
    expect(ics).toContain("UID:theokot-rental-rent123@vtk.be");
    expect(ics).toContain("LOCATION:Theokot\\, Kasteelpark Arenberg 41\\, 3001 Heverlee");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("CLASS:PRIVATE");
  });

  it("geeft nieuwe aanvragen de [Aanvraag] prefix zodat ze direct opvallen in de agenda", () => {
    const rental = sampleRental({
      id: "rent456",
      responsibleName: "Lukas Mees",
      purpose: "Verjaardagsfeestje",
      status: "UNANSWERED",
    });
    const ics = serializeRentalCalendar([rental], { locale: "nl", now: NOW });

    expect(ics).toContain("SUMMARY:[Aanvraag] Lukas Mees – Verjaardagsfeestje");
    expect(ics).toContain("UID:theokot-rental-rent456@vtk.be");
  });

  it("vertaalt prefixes en categorieën naar het Engels indien gevraagd", () => {
    const request = sampleRental({
      id: "rent789",
      responsibleName: "John Doe",
      purpose: "Board game night",
      status: "UNANSWERED",
    });
    const approved = sampleRental({
      id: "rent999",
      responsibleName: "Jane Doe",
      purpose: "LAN party",
      status: "APPROVED",
    });

    const ics = serializeRentalCalendar([request, approved], { locale: "en", now: NOW });

    expect(ics).toContain("SUMMARY:[Request] John Doe – Board game night");
    expect(ics).toContain("SUMMARY:[Approved] Jane Doe – LAN party");
    expect(ics).toContain("CATEGORIES:Theokot,Rentals,Unanswered");
    expect(ics).toContain("CATEGORIES:Theokot,Rentals,Approved");
  });

  it("bevat contactgegevens, waarborg, contract, sleutel en beheerlink in de beschrijving", () => {
    const rental = sampleRental();
    const ics = serializeRentalCalendar([rental], {
      locale: "nl",
      origin: "https://vtk.be",
      now: NOW,
    });
    const content = unfold(ics);

    expect(content).toContain("Sarah De Smet (sarah@voorbeeld.be\\, 0470 99 88 77)");
    expect(content).toContain("Doopcantus Theokot");
    expect(content).toContain("Verwachte aanwezigen: 80");
    expect(content).toContain("OS Binnen (Overschrijving)");
    expect(content).toContain("Contract: Getekend");
    expect(content).toContain("Sleutel: Pending");
    expect(content).toContain("Opmerkingen: We brengen eigen tapinstallatie mee.");
    expect(content).toContain("Interne notitie: Akkoord met verlengd einduur");
    expect(content).toContain("Bekijk in beheer: https://vtk.be/admin/theokot/verhuur?tab=kalender");
  });

  it("formateert start- en eindmoment correct in UTC", () => {
    const rental = sampleRental({
      startsAt: new Date("2026-10-15T18:00:00.000Z"),
      endsAt: new Date("2026-10-16T01:00:00.000Z"),
    });
    const ics = serializeRentalCalendar([rental], { locale: "nl", now: NOW });

    expect(ics).toContain("DTSTART:20261015T180000Z");
    expect(ics).toContain("DTEND:20261016T010000Z");
  });
});
