import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, formatDate, formatUtc, type IcsEvent } from "@/lib/calendar/ics";

const NOW = new Date("2026-08-06T09:00:00.000Z");

function event(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "evt1@vtk.be",
    start: new Date("2026-10-21T18:00:00.000Z"),
    end: new Date("2026-10-21T23:00:00.000Z"),
    allDay: false,
    summary: "24 Urenloop",
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...overrides,
  };
}

/** Splitst op CRLF maar plakt vervolgregels (die met een spatie beginnen) terug aan elkaar. */
function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ") && out.length > 0) out[out.length - 1] += line.slice(1);
    else if (line !== "") out.push(line);
  }
  return out;
}

describe("foldLine", () => {
  it("laat regels tot 75 octets ongemoeid", () => {
    const line = "X".repeat(75);
    expect(foldLine(line)).toBe(line);
  });

  it("vouwt langere regels met een spatie als vervolgmarkering", () => {
    const line = `SUMMARY:${"A".repeat(100)}`;
    const folded = foldLine(line);
    const segments = folded.split("\r\n");
    expect(segments.length).toBe(2);
    expect(Buffer.from(segments[0]!, "utf8").length).toBe(75);
    expect(segments[1]!.startsWith(" ")).toBe(true);
    expect(segments.map((s, i) => (i === 0 ? s : s.slice(1))).join("")).toBe(line);
  });

  it("telt octets, niet tekens, en knipt nooit door een meerbyte-teken", () => {
    // Elke é is twee octets: 40 tekens is 80 octets en moet dus vouwen.
    const line = `SUMMARY:${"é".repeat(40)}`;
    const folded = foldLine(line);
    for (const segment of folded.split("\r\n")) {
      expect(Buffer.from(segment, "utf8").length).toBeLessThanOrEqual(75);
      // Een kapotgeknipt teken wordt U+FFFD bij het decoderen.
      expect(segment).not.toContain("�");
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("datumformattering", () => {
  it("schrijft tijdstippen in UTC", () => {
    expect(formatUtc(new Date("2026-10-21T18:05:09.000Z"))).toBe("20261021T180509Z");
  });

  it("neemt de kalenderdag in Brussel, niet in UTC", () => {
    // 23:30 UTC is in de zomer al 01:30 de volgende dag in Brussel.
    expect(formatDate(new Date("2026-07-21T23:30:00.000Z"))).toBe("20260722");
  });

  it("telt dagen als kalenderdagen op, ook over de zomeruur-sprong", () => {
    // 25 oktober 2026 is de nacht waarin de klok terugvalt.
    expect(formatDate(new Date("2026-10-25T10:00:00.000Z"), 1)).toBe("20261026");
  });
});

describe("buildIcs", () => {
  it("levert een geldige VCALENDAR met CRLF-regeleindes", () => {
    const ics = buildIcs({ name: "VTK", events: [event()] }, NOW);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);

    const lines = unfold(ics);
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("X-WR-CALNAME:VTK");
    expect(lines).toContain("DTSTAMP:20260806T090000Z");
    expect(lines).toContain("DTSTART:20261021T180000Z");
    expect(lines).toContain("DTEND:20261021T230000Z");
    expect(lines).toContain("SUMMARY:24 Urenloop");
    expect(lines).toContain("UID:evt1@vtk.be");
  });

  it("geeft een hele-dag-event een exclusieve einddatum", () => {
    const lines = unfold(
      buildIcs(
        {
          name: "VTK",
          events: [
            event({
              allDay: true,
              start: new Date("2026-10-21T00:00:00.000+02:00"),
              end: new Date("2026-10-21T00:00:00.000+02:00"),
            }),
          ],
        },
        NOW,
      ),
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20261021");
    // Eén dag op de 21ste eindigt exclusief op de 22ste.
    expect(lines).toContain("DTEND;VALUE=DATE:20261022");
  });

  it("escapet backslashes, puntkomma's, komma's en newlines in tekstwaarden", () => {
    const lines = unfold(
      buildIcs(
        {
          name: "VTK",
          events: [
            event({
              summary: "Cantus; met, tekens",
              description: "Regel een\nRegel twee \\ einde",
              location: "Alma 2, Leuven",
            }),
          ],
        },
        NOW,
      ),
    );
    expect(lines).toContain("SUMMARY:Cantus\\; met\\, tekens");
    expect(lines).toContain("DESCRIPTION:Regel een\\nRegel twee \\\\ einde");
    expect(lines).toContain("LOCATION:Alma 2\\, Leuven");
  });

  it("houdt UID stabiel en laat SEQUENCE stijgen met updatedAt", () => {
    const first = unfold(buildIcs({ name: "VTK", events: [event()] }, NOW));
    const later = unfold(
      buildIcs(
        { name: "VTK", events: [event({ updatedAt: new Date("2026-08-02T10:00:00.000Z") })] },
        NOW,
      ),
    );

    const sequence = (lines: string[]) =>
      Number(lines.find((l) => l.startsWith("SEQUENCE:"))!.slice("SEQUENCE:".length));

    expect(later).toContain("UID:evt1@vtk.be");
    expect(sequence(later)).toBeGreaterThan(sequence(first));
    expect(sequence(first)).toBeGreaterThan(0);
  });

  it("laat lege optionele velden weg en markeert privé-events", () => {
    const lines = unfold(
      buildIcs(
        { name: "VTK", events: [event({ description: "  ", location: null, private: true })] },
        NOW,
      ),
    );
    expect(lines.some((l) => l.startsWith("DESCRIPTION:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("LOCATION:"))).toBe(false);
    expect(lines).toContain("CLASS:PRIVATE");
  });

  it("schrijft categorieën als één komma-gescheiden regel", () => {
    const lines = unfold(
      buildIcs(
        { name: "VTK", events: [event({ categories: ["Eerstejaars", "Sport"] })] },
        NOW,
      ),
    );
    expect(lines).toContain("CATEGORIES:Eerstejaars,Sport");
  });
});
