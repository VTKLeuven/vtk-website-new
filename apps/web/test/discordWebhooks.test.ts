import { describe, expect, it } from "vitest";
import { eventSignupLink, type EventSignupLinkSource } from "@/lib/calendar/signupLink";
import {
  discordDescription,
  discordEventMessage,
  discordMessageWithoutButtons,
  discordWhen,
  type DiscordEventPost,
} from "@/lib/discord/eventMessage";
import { discordAutoPostDue, discordDueAt, discordWaitReason } from "@/lib/discord/rules";
import { discordChannelUrl, parseDiscordWebhookUrl } from "@/lib/discord/webhookUrl";

const ID = "1234567890123456789";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdefghijklmnop";

describe("een Discord-webhook-URL", () => {
  it("schakelt de vormen die Discord geeft gelijk", () => {
    const canonical = `https://discord.com/api/webhooks/${ID}/${TOKEN}`;
    for (const raw of [
      canonical,
      `  ${canonical}/  `,
      `https://discordapp.com/api/webhooks/${ID}/${TOKEN}`,
      `https://ptb.discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://canary.discord.com/api/v10/webhooks/${ID}/${TOKEN}?thread_id=1`,
    ]) {
      expect(parseDiscordWebhookUrl(raw)).toEqual({ id: ID, url: canonical });
    }
  });

  it("post nergens anders naartoe dan naar Discord", () => {
    for (const raw of [
      `http://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com.evil.be/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com@evil.be/api/webhooks/${ID}/${TOKEN}`,
      `https://evil.be/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com:8443/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}`,
      `https://discord.com/api/webhooks/${ID}/${TOKEN}/slack`,
      "geen url",
    ]) {
      expect(parseDiscordWebhookUrl(raw)).toBeNull();
    }
  });

  it("linkt enkel naar een kanaal met echte ids", () => {
    expect(discordChannelUrl("1", "2")).toBe("https://discord.com/channels/1/2");
    expect(discordChannelUrl(null, "2")).toBeNull();
    expect(discordChannelUrl("1", "../2")).toBeNull();
  });
});

describe("wanneer een evenement vanzelf in een kanaal komt", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-10-18T12:00:00Z");
  const webhook = { enabled: true, autoSince: new Date("2026-10-01T00:00:00Z") };
  const event = {
    publishedAt: new Date("2026-10-10T09:00:00Z"),
    imageKey: "events/affiche.jpg",
    start: new Date("2026-10-25T19:00:00Z"),
    end: new Date("2026-10-25T23:00:00Z"),
  };
  const inDays = (days: number) => ({
    start: new Date(now.getTime() + days * day),
    end: new Date(now.getTime() + days * day + 4 * 3600e3),
  });

  it("post een gepubliceerd evenement met banner binnen de twee weken", () => {
    expect(discordWaitReason(event, webhook, now)).toBeNull();
    expect(discordAutoPostDue(event, webhook, now)).toBe(true);
  });

  it("wacht met iets van over twee maanden tot twee weken op voorhand", () => {
    const later = { ...event, ...inDays(60) };
    expect(discordWaitReason(later, webhook, now)).toBe("scheduled");
    expect(discordDueAt(later)).toEqual(new Date(later.start.getTime() - 14 * day));
    const twoWeeksBefore = new Date(later.start.getTime() - 14 * day + 60e3);
    expect(discordWaitReason(later, webhook, twoWeeksBefore)).toBeNull();
  });

  it("post wat al lang online staat, zodra het binnen de twee weken komt", () => {
    // Gepubliceerd voor de webhook bestond, maar begint pas over een maand.
    const old = { ...event, publishedAt: new Date("2026-09-01T09:00:00Z"), ...inDays(30) };
    expect(discordWaitReason(old, webhook, now)).toBe("scheduled");
    expect(discordWaitReason(old, webhook, new Date(old.start.getTime() - 13 * day))).toBeNull();
  });

  it("post wat binnen de twee weken gepubliceerd wordt meteen", () => {
    const soon = { ...event, publishedAt: now, ...inDays(5) };
    expect(discordDueAt(soon)).toEqual(now);
    expect(discordWaitReason(soon, webhook, now)).toBeNull();
  });

  it("gooit niet alles van de komende twee weken in het kanaal bij een nieuwe webhook", () => {
    const fresh = { enabled: true, autoSince: now };
    const alreadyDue = { ...event, publishedAt: new Date("2026-09-01T09:00:00Z"), ...inDays(5) };
    expect(discordWaitReason(alreadyDue, fresh, now)).toBe("before-webhook");
    // Wat pas later binnen de twee weken komt, volgt wel vanzelf.
    const later = { ...alreadyDue, ...inDays(20) };
    expect(discordWaitReason(later, fresh, now)).toBe("scheduled");
  });

  it("wacht op de banner, en zegt dat pas wanneer het evenement aan de beurt is", () => {
    expect(discordWaitReason({ ...event, imageKey: null }, webhook, now)).toBe("banner");
    expect(discordWaitReason({ ...event, imageKey: null, ...inDays(40) }, webhook, now)).toBe("scheduled");
  });

  it("post geen concept, niets van voorbij en niets wanneer de webhook uit staat", () => {
    expect(discordWaitReason({ ...event, publishedAt: null }, webhook, now)).toBe("draft");
    expect(discordWaitReason({ ...event, ...inDays(-2) }, webhook, now)).toBe("past");
    expect(discordWaitReason(event, { ...webhook, enabled: false }, now)).toBe("disabled");
  });
});

const ORIGIN = "https://vtk.be";

function post(overrides: Partial<DiscordEventPost> = {}): DiscordEventPost {
  return {
    title: "Galabal 2026",
    description: "Het feest van het jaar.",
    start: new Date("2026-11-14T19:00:00Z"),
    end: new Date("2026-11-15T02:00:00Z"),
    allDay: false,
    moments: [],
    location: "Brabanthal",
    organiser: "Groep 3",
    imageUrl: `${ORIGIN}/api/media/events/galabal.jpg`,
    infoUrl: `${ORIGIN}/api/discord/klik/p1/info`,
    link: { kind: "tickets", label: "Tickets kopen", url: `${ORIGIN}/api/discord/klik/p1/link` },
    siteOrigin: ORIGIN,
    ...overrides,
  };
}

describe("het bericht in het kanaal", () => {
  const message = discordEventMessage(post(), { avatarUrl: `${ORIGIN}/vtk-discord-avatar.png` });

  it("staat er als VTK Kalender met het schild, en pingt nooit iemand", () => {
    expect(message.username).toBe("VTK Kalender");
    expect(message.avatar_url).toBe(`${ORIGIN}/vtk-discord-avatar.png`);
    expect(message.allowed_mentions).toEqual({ parse: [] });
  });

  it("draagt de banner, de gele kleur en de knoppen in de volgorde van de eventpagina", () => {
    const embed = message.embeds![0]!;
    expect(embed.image?.url).toBe(`${ORIGIN}/api/media/events/galabal.jpg`);
    expect(embed.color).toBe(0xffd23f);
    expect(embed.url).toBe(`${ORIGIN}/api/discord/klik/p1/info`);
    const buttons = message.components![0]!.components;
    expect(buttons.map((button) => button.label)).toEqual(["Tickets kopen", "Meer info"]);
    expect(buttons.every((button) => button.style === 5)).toBe(true);
  });

  it("laat de tweede knop weg zonder inschrijf- of ticketlink", () => {
    const plain = discordEventMessage(post({ link: null }), { avatarUrl: "a" });
    expect(plain.components![0]!.components.map((button) => button.label)).toEqual(["Meer info"]);
  });

  it("zet de links in de embed wanneer Discord de knoppen weigert", () => {
    const fallback = discordMessageWithoutButtons(message);
    expect(fallback.components).toBeUndefined();
    const links = fallback.embeds![0]!.fields!.find((field) => field.name === "Links");
    expect(links?.value).toContain(`[Tickets kopen](${ORIGIN}/api/discord/klik/p1/link)`);
    expect(links?.value).toContain(`[Meer info](${ORIGIN}/api/discord/klik/p1/info)`);
  });
});

describe("wanneer, als Discord-tijdstempels", () => {
  const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

  it("schrijft een nachtfeest als één avond", () => {
    const when = discordWhen(post());
    expect(when).toContain(`<t:${seconds("2026-11-14T19:00:00Z")}:F> tot <t:${seconds("2026-11-15T02:00:00Z")}:t>`);
    expect(when).toContain(`<t:${seconds("2026-11-14T19:00:00Z")}:R>`);
  });

  it("geeft een heledagevenement enkel datums", () => {
    const day = discordWhen(
      post({ allDay: true, start: new Date("2026-11-14T00:00:00+01:00"), end: new Date("2026-11-14T00:00:00+01:00") }),
    );
    expect(day).not.toContain(":F>");
    expect(day).toContain(":D>");
    expect(day).not.toContain("t.e.m.");
  });

  it("zet een reeks momenten onder elkaar, en kort een lange reeks in", () => {
    const moments = Array.from({ length: 6 }, (_, index) => ({
      start: new Date(Date.UTC(2026, 10, 9 + index, 17)),
      end: new Date(Date.UTC(2026, 10, 9 + index, 18)),
    }));
    const lines = discordWhen(post({ moments })).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[4]).toBe("en nog 2 momenten");
  });
});

describe("de beschrijving in Discord", () => {
  it("maakt van een kop vette tekst, laat foto's weg en maakt links volledig", () => {
    const text = discordDescription("## Programma\n\n![affiche](/api/media/x.jpg)\n\nZie de [codex](/kalender/codex).", ORIGIN);
    expect(text).toContain("**Programma**");
    expect(text).not.toContain("affiche");
    expect(text).toContain("[codex](https://vtk.be/kalender/codex)");
  });

  it("stopt een lange tekst aan het einde van een alinea", () => {
    const paragraph = "woord ".repeat(60).trim();
    const text = discordDescription(`${paragraph}\n\n${paragraph}\n\n${paragraph}`, ORIGIN, 700);
    expect(text.endsWith("\n\n…")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(704);
  });

  it("knipt een te lange eerste alinea af als platte tekst op een woordgrens", () => {
    const text = discordDescription(`**${"lang ".repeat(300)}**`, ORIGIN, 100);
    expect(text).not.toContain("**");
    expect(text.endsWith("lang…")).toBe(true);
  });
});

describe("de inschrijf- of ticketlink", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const ticket = {
    slug: "galabal",
    status: "PUBLISHED",
    isPrivate: false,
    startsAt: new Date("2026-11-14T19:00:00Z"),
    createdAt: new Date("2026-10-01T00:00:00Z"),
  };
  const base: EventSignupLinkSource = {
    url: "https://partner.be/inschrijven",
    urlLabelNl: "Inschrijflink",
    urlLabelEn: null,
    ticketEvents: [ticket],
    form: { slug: "galabal-form", status: "PUBLISHED", closesAt: null },
  };

  it("kiest eerst de tickets, dan het formulier, dan de externe link", () => {
    expect(eventSignupLink(base, now)).toEqual({ kind: "tickets", label: "Tickets kopen", href: "/tickets/galabal" });
    expect(eventSignupLink({ ...base, ticketEvents: [] }, now)?.href).toBe("/formulieren/galabal-form");
    expect(eventSignupLink({ ...base, ticketEvents: [], form: null }, now)).toEqual({
      kind: "link",
      label: "Inschrijflink",
      href: "https://partner.be/inschrijven",
    });
  });

  it("slaat een privéverkoop en een gesloten formulier over", () => {
    const link = eventSignupLink(
      {
        ...base,
        ticketEvents: [{ ...ticket, isPrivate: true }],
        form: { slug: "x", status: "PUBLISHED", closesAt: new Date("2026-10-01T00:00:00Z") },
      },
      now,
    );
    expect(link?.kind).toBe("link");
  });

  it("vertrouwt geen link die geen webadres of pad is", () => {
    expect(eventSignupLink({ ...base, ticketEvents: [], form: null, url: "javascript:alert(1)" }, now)).toBeNull();
    expect(eventSignupLink({ ...base, ticketEvents: [], form: null, url: "//evil.be" }, now)).toBeNull();
  });

  it("spreekt Engels op de Engelse site", () => {
    expect(eventSignupLink(base, now, "en")).toEqual({ kind: "tickets", label: "Buy tickets", href: "/en/tickets/galabal" });
  });
});
