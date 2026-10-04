import { describe, expect, it } from "vitest";
import {
  palPlusMailMoment,
  palPlusNewRequestNotificationMail,
  palPlusRequestClosedMail,
  palPlusRequestReceivedMail,
  palPlusSessionChangedMail,
  palPlusSessionForRequestMail,
  palPlusSessionReminderMail,
  palPlusTutorAssignedMail,
  type PalPlusMailSession,
} from "@/lib/palPlusMail";
import { palPlusReminderHandledAt, PAL_PLUS_REMINDER_LEAD_MS } from "@/lib/palPlus";

// Donderdag 22 oktober 2026, 14:00 - 16:00 in Brussel (zomertijd, UTC+2).
const START = new Date("2026-10-22T12:00:00Z");
const END = new Date("2026-10-22T14:00:00Z");
const PAGE = "https://vtk.be/pal-plus";
const CALENDAR = "https://vtk.be/api/pal-plus/sessie/s1";

const session: PalPlusMailSession = {
  courseLabel: "Thermodynamica (H01C4D)",
  description: "Kringprocessen",
  startsAt: START,
  endsAt: END,
  roomLabel: "200K 00.06 (Aula)",
  tutorNames: ["Robbe"],
};

describe("palPlusMailMoment", () => {
  it("zet het moment in Brusselse tijd", () => {
    expect(palPlusMailMoment(START, END, "nl")).toBe("donderdag 22 oktober, 14:00 - 16:00");
    expect(palPlusMailMoment(START, END, "en")).toBe("Thursday 22 October, 14:00 - 16:00");
  });
});

describe("bevestiging na het indienen", () => {
  it("noemt bij een aanbod het voorgestelde moment", () => {
    const mail = palPlusRequestReceivedMail({
      locale: "nl",
      name: "Fien",
      kind: "GIVE",
      courseLabel: "Thermodynamica",
      description: "Oefeningen",
      proposed: { startsAt: START, endsAt: END },
      pageUrl: PAGE,
    });
    expect(mail.subject).toBe("Je PAL+-aanbod is binnen: Thermodynamica");
    expect(mail.text).toContain("Voorgesteld moment: donderdag 22 oktober, 14:00 - 16:00");
    expect(mail.text).toContain(`${PAGE}#jouw-aanvragen`);
  });

  it("zegt bij een vraag dat Onderwijs ze eerst nakijkt", () => {
    const mail = palPlusRequestReceivedMail({
      locale: "en",
      name: "Fien",
      kind: "FOLLOW",
      courseLabel: "Statics",
      description: "Free body diagrams",
      proposed: null,
      pageUrl: PAGE,
    });
    expect(mail.text).toContain("reviews your request");
    expect(mail.text).not.toContain("Proposed moment");
  });

  it("escapet wat de indiener intikte in de html", () => {
    const mail = palPlusRequestReceivedMail({
      locale: "nl",
      name: "<b>Fien</b>",
      kind: "FOLLOW",
      courseLabel: "Vak",
      description: '<script>alert("x")</script>',
      proposed: null,
      pageUrl: PAGE,
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<b>Fien</b>");
  });
});

describe("gesloten aanvraag", () => {
  const base = { locale: "nl" as const, name: "Fien", courseLabel: "Statica", reason: "Buiten PAL+.", pageUrl: PAGE };

  it("onderscheidt een vraag die nooit online stond van een die al online stond", () => {
    const notOnline = palPlusRequestClosedMail({ ...base, kind: "FOLLOW", wasOnline: false });
    const online = palPlusRequestClosedMail({ ...base, kind: "FOLLOW", wasOnline: true });
    expect(notOnline.html).toContain("Je vraag komt niet online");
    expect(online.html).toContain("Je vraag is gesloten");
    expect(online.text).toContain("niet meer op de PAL+-pagina");
  });

  it("zet de reden erin", () => {
    const mail = palPlusRequestClosedMail({ ...base, kind: "GIVE", wasOnline: false });
    expect(mail.text).toContain("Reden:\nBuiten PAL+.");
    expect(mail.text).toContain("Een nieuw aanbod doen kan altijd.");
  });
});

describe("tutor van een sessie", () => {
  const base = { locale: "nl" as const, name: "Robbe", pageUrl: PAGE, calendarUrl: CALENDAR };

  it("noemt de bonnetjes, behalve wanneer er geen zijn (praesidium)", () => {
    expect(palPlusTutorAssignedMail({ ...base, session, fromOffer: false, reward: 2, coTutorNames: [] }).text).toContain(
      "2 bonnetjes na de sessie",
    );
    const praesidium = palPlusTutorAssignedMail({ ...base, session, fromOffer: false, reward: 0, coTutorNames: [] });
    expect(praesidium.text).not.toContain("bonnetje");
  });

  it("zegt dat het aanbod aanvaard is wanneer de sessie eruit kwam", () => {
    expect(palPlusTutorAssignedMail({ ...base, session, fromOffer: true, reward: 2, coTutorNames: [] }).text).toContain(
      "aanvaardde je aanbod",
    );
  });

  it("noemt de andere tutor, niet de ontvanger zelf", () => {
    const mail = palPlusTutorAssignedMail({
      ...base,
      session: { ...session, tutorNames: ["Robbe", "Lien"] },
      fromOffer: false,
      reward: 2,
      coTutorNames: ["Lien"],
    });
    expect(mail.text).toContain("Je geeft de sessie samen met Lien.");
    expect(mail.text).toContain("Gegeven door: Robbe en Lien");
  });

  it("zegt dat het lokaal volgt wanneer het nog niet vastligt", () => {
    const mail = palPlusTutorAssignedMail({ ...base, session: { ...session, roomLabel: null }, fromOffer: false, reward: 2, coTutorNames: [] });
    expect(mail.text).toContain("Lokaal: volgt nog");
    expect(mail.text).toContain("Lokaal volgt: Het lokaal ligt nog niet vast.");
  });
});

describe("gewijzigde sessie", () => {
  const base = { locale: "nl" as const, name: "Fien", role: "attendee" as const, pageUrl: PAGE, calendarUrl: CALENDAR };

  it("heet 'Verplaatst' bij een nieuw moment en noemt het oude", () => {
    const mail = palPlusSessionChangedMail({
      ...base,
      session,
      change: { previousMoment: { startsAt: new Date("2026-10-21T12:00:00Z"), endsAt: new Date("2026-10-21T14:00:00Z") } },
    });
    expect(mail.subject).toBe("Verplaatst: PAL+ Thermodynamica (H01C4D)");
    expect(mail.text).toContain("(eerst woensdag 21 oktober, 14:00 - 16:00)");
    expect(mail.text).toContain("Schrijf je dan uit");
  });

  it("heet 'Lokaal bekend' wanneer het lokaal eerst nog niet vastlag", () => {
    const mail = palPlusSessionChangedMail({ ...base, session, change: { previousRoom: { label: null } } });
    expect(mail.subject).toBe("Lokaal bekend: PAL+ Thermodynamica (H01C4D), 22 okt");
    expect(mail.text).toContain("Het lokaal is bekend: 200K 00.06 (Aula).");
  });

  it("heet 'Ander lokaal' wanneer het lokaal verandert", () => {
    const mail = palPlusSessionChangedMail({ ...base, session, change: { previousRoom: { label: "200A 00.144" } } });
    expect(mail.subject).toBe("Ander lokaal: PAL+ Thermodynamica (H01C4D), 22 okt");
    expect(mail.text).toContain("(eerst 200A 00.144)");
  });
});

describe("herinnering", () => {
  const base = { locale: "nl" as const, name: "Robbe", session, pageUrl: PAGE, calendarUrl: CALENDAR };

  it("vertelt de tutor hoeveel mensen er komen", () => {
    expect(palPlusSessionReminderMail({ ...base, role: "tutor", attendeeCount: 0 }).text).toContain("Er is nog niemand ingeschreven.");
    expect(palPlusSessionReminderMail({ ...base, role: "tutor", attendeeCount: 1 }).text).toContain("Er is 1 persoon ingeschreven.");
    expect(palPlusSessionReminderMail({ ...base, role: "tutor", attendeeCount: 7 }).text).toContain("Er zijn 7 mensen ingeschreven.");
  });

  it("vraagt een ingeschrevene zich uit te schrijven als die toch niet kan", () => {
    const mail = palPlusSessionReminderMail({ ...base, role: "attendee", attendeeCount: 7 });
    expect(mail.subject).toBe("Morgen: PAL+ Thermodynamica (H01C4D)");
    expect(mail.text).toContain("Schrijf je dan uit");
    expect(mail.text).not.toContain("ingeschreven.");
  });
});

describe("sessie voor een vraag", () => {
  it("heeft een eigen aanhef voor wie de vraag steunde", () => {
    const backer = palPlusSessionForRequestMail({
      locale: "nl",
      name: "Fien",
      role: "backer",
      session,
      pageUrl: PAGE,
      calendarUrl: CALENDAR,
    });
    expect(backer.subject).toBe("Er is een PAL+-sessie voor Thermodynamica (H01C4D)");
    expect(backer.text).toContain("een vraag die je steunde");
    expect(backer.text).toContain(`Inschrijven: ${PAGE}`);
  });
});

describe("melding aan Onderwijs", () => {
  it("zegt dat een ingetikt vak nog geen vak uit de lijst is", () => {
    const mail = palPlusNewRequestNotificationMail({
      kind: "FOLLOW",
      submitterName: "Fien",
      submitterEmail: "fien@voorbeeld.test",
      courseLabel: "Statica",
      courseTyped: true,
      description: "Vrijlichaamsdiagrammen",
      proposed: null,
      preferredPeriod: "januari",
      respondsToLabel: null,
      adminUrl: "https://vtk.be/admin/pal-plus",
    });
    expect(mail.subject).toBe("[PAL+] Nieuwe hulpvraag: Statica (Fien)");
    expect(mail.text).toContain("Vak: Statica (zelf ingetikt, nog geen vak uit de lijst)");
    expect(mail.text).toContain("Wanneer nodig: januari");
    expect(mail.text).toContain("pas op de PAL+-pagina wanneer je ze nakijkt");
  });
});

describe("palPlusReminderHandledAt", () => {
  const now = new Date("2026-10-04T12:00:00Z");

  it("laat de herinnering open voor een sessie verder dan een dag weg", () => {
    expect(palPlusReminderHandledAt(new Date(now.getTime() + PAL_PLUS_REMINDER_LEAD_MS + 60_000), now)).toBeNull();
  });

  it("handelt ze af voor een sessie binnen het venster, of al voorbij", () => {
    expect(palPlusReminderHandledAt(new Date(now.getTime() + 3 * 60 * 60 * 1000), now)).toBe(now);
    expect(palPlusReminderHandledAt(new Date(now.getTime() - 60_000), now)).toBe(now);
  });
});
