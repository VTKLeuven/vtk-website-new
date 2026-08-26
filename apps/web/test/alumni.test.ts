import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseAlumniPaste, toAlumniCsv, type AlumniRecipient } from "@/lib/alumni";

describe("parseAlumniPaste", () => {
  it("aanvaardt komma's, puntkomma's en tabs door elkaar", () => {
    const { rows, invalid } = parseAlumniPaste(
      [
        "Jan, Peeters, jan@example.com, 2004, ja",
        "An; Janssens; an@example.com; 2011",
        "Karel\tDe Vos\tkarel@example.com",
      ].join("\n"),
    );

    expect(invalid).toHaveLength(0);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      firstName: "Jan",
      lastName: "Peeters",
      email: "jan@example.com",
      graduationYear: 2004,
      wasInVtk: true,
    });
    // Zonder jaar en zonder VTK-kolom blijft de rij geldig; het adresboek is
    // vaak alles wat er van een oude lijst overblijft.
    expect(rows[2]).toMatchObject({ graduationYear: null, wasInVtk: false });
  });

  it("slaat een kopregel uit een eerdere export over", () => {
    const { rows, invalid } = parseAlumniPaste(
      ["firstname,lastname,email", "Jan,Peeters,jan@example.com"].join("\n"),
    );
    expect(invalid).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });

  it("meldt onbruikbare regels met hun regelnummer in plaats van ze te slikken", () => {
    const { rows, invalid } = parseAlumniPaste(
      ["Jan,Peeters,jan@example.com", "Onzin zonder komma's", "An,Janssens,geen-adres"].join("\n"),
    );
    expect(rows).toHaveLength(1);
    expect(invalid.map((row) => row.line)).toEqual([2, 3]);
  });

  it("lowercased het adres, want daarop wordt ontdubbeld", () => {
    const { rows } = parseAlumniPaste("Jan,Peeters,JAN@Example.COM");
    expect(rows[0]!.email).toBe("jan@example.com");
  });

  it("negeert lege regels", () => {
    const { rows, invalid } = parseAlumniPaste("\n\nJan,Peeters,jan@example.com\n\n");
    expect(rows).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });
});

describe("toAlumniCsv", () => {
  const row = (over: Partial<AlumniRecipient> = {}): AlumniRecipient => ({
    firstname: "Jan",
    lastname: "Peeters",
    email: "jan@example.com",
    graduationYear: 2004,
    wasInVtk: true,
    source: "contact",
    ...over,
  });

  it("schrijft een kopregel en een BOM, zodat Excel accenten niet verminkt", () => {
    const csv = toAlumniCsv([row()]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("firstname,lastname,email,graduationyear,wasinvtk");
  });

  it("quote't een veld met een komma erin", () => {
    const csv = toAlumniCsv([row({ lastname: "Peeters, jr." })]);
    expect(csv).toContain('"Peeters, jr."');
  });

  it("laat een ontbrekend afstudeerjaar leeg in plaats van 'null'", () => {
    const csv = toAlumniCsv([row({ graduationYear: null, wasInVtk: false })]);
    expect(csv).toContain("jan@example.com,,nee");
  });
});

/**
 * De ontdubbeling is de enige reden dat het adresboek en de accounts naast
 * elkaar mogen bestaan; loopt ze mis, dan krijgt iemand elke mailing twee keer.
 */
describe("listAlumniRecipients", () => {
  const findMany = vi.fn();
  const contactFindMany = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset();
    contactFindMany.mockReset();
  });

  async function load() {
    vi.doMock("@vtk/db", () => ({
      prisma: {
        user: { findMany },
        alumniContact: { findMany: contactFindMany },
      },
    }));
    return (await import("@/lib/alumni")).listAlumniRecipients;
  }

  it("laat het account winnen wanneer hetzelfde adres in beide bronnen staat", async () => {
    findMany.mockResolvedValue([
      {
        name: "Jan Peeters",
        firstName: "Jan",
        lastName: "Peeters",
        email: "jan@kuleuven.be",
        personalEmail: "jan@example.com",
        emailPreference: "PERSONAL",
        graduationYear: 2004,
        wasInVtk: true,
      },
    ]);
    contactFindMany.mockResolvedValue([
      {
        firstName: "Jan",
        lastName: "P.",
        email: "JAN@example.com",
        graduationYear: null,
        wasInVtk: false,
      },
    ]);

    const listAlumniRecipients = await load();
    const rows = await listAlumniRecipients();

    expect(rows).toHaveLength(1);
    // Het voorkeursadres van het account, en de gegevens van het account.
    expect(rows[0]).toMatchObject({
      email: "jan@example.com",
      lastname: "Peeters",
      graduationYear: 2004,
      source: "account",
    });
  });

  it("houdt beide bronnen wanneer de adressen verschillen", async () => {
    findMany.mockResolvedValue([
      {
        name: "Jan Peeters",
        firstName: "Jan",
        lastName: "Peeters",
        email: "jan@kuleuven.be",
        personalEmail: null,
        emailPreference: "UNIVERSITY",
        graduationYear: 2004,
        wasInVtk: false,
      },
    ]);
    contactFindMany.mockResolvedValue([
      {
        firstName: "An",
        lastName: "Janssens",
        email: "an@example.com",
        graduationYear: 2011,
        wasInVtk: true,
      },
    ]);

    const listAlumniRecipients = await load();
    const rows = await listAlumniRecipients();

    expect(rows).toHaveLength(2);
    // Nieuwste lichting eerst.
    expect(rows.map((r) => r.graduationYear)).toEqual([2011, 2004]);
  });
});


/**
 * Het adresboek en de accounts zijn twee bronnen voor dezelfde lijst. Een
 * alumnus die toevallig een account heeft, hoort dus **niet** als tweede rij in
 * het adresboek te belanden: dat is precies hoe iemand elke mailing dubbel krijgt.
 */
describe("listAlumniAccounts", () => {
  const findMany = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    findMany.mockReset();
  });

  async function load() {
    vi.doMock("@vtk/db", () => ({ prisma: { user: { findMany } } }));
    return (await import("@/lib/alumni")).listAlumniAccounts;
  }

  it("gebruikt het voorkeursadres, want een universiteitsmail sterft af", async () => {
    findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Jan Peeters",
        email: "r0123456@kuleuven.be",
        personalEmail: "jan@example.com",
        emailPreference: "PERSONAL",
        graduationYear: 2004,
        wasInVtk: true,
        alumniMailOptIn: true,
        active: true,
      },
      {
        id: "u2",
        name: "An Janssens",
        email: "r0999999@kuleuven.be",
        personalEmail: null,
        emailPreference: "UNIVERSITY",
        graduationYear: 2011,
        wasInVtk: false,
        alumniMailOptIn: false,
        active: true,
      },
    ]);

    const listAlumniAccounts = await load();
    const rows = await listAlumniAccounts({});

    expect(rows[0]).toMatchObject({ email: "jan@example.com", optedIn: true });
    expect(rows[1]).toMatchObject({ email: "r0999999@kuleuven.be", optedIn: false });
  });

  it("laat gewiste accounts eruit", async () => {
    findMany.mockResolvedValue([]);
    const listAlumniAccounts = await load();
    await listAlumniAccounts({});
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ alumni: true, deletedAt: null }),
      }),
    );
  });
});
